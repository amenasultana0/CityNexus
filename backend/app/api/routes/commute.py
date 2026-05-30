"""
Commute API — weekly commute plan.
Single endpoint, no auth required.

Routes API called once per request — distance reused across all 7 days.
Surge applied per-day based on day_of_week and live weather.
"""

from datetime import date, timedelta
from typing import Any
import httpx

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.deps import SessionDep
from app.services import cost as cost_svc
from app.services import demand as demand_svc
from app.services import weather as weather_svc
from app.services.routes_service import get_road_distance

router = APIRouter(tags=["commute"])

_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

INDIAN_HOLIDAYS_CALENDAR_ID = "en.indian#holiday@group.v.calendar.google.com"


class WeeklyPlanRequest(BaseModel):
    origin_lat: float = Field(ge=17.0, le=18.0)
    origin_lon: float = Field(ge=78.0, le=79.0)
    dest_lat: float = Field(ge=17.0, le=18.0)
    dest_lon: float = Field(ge=78.0, le=79.0)
    passengers: int = Field(default=1, ge=1, le=6)
    departure_time: str = Field(..., description="HH:MM — daily departure time")
    round_trip: bool = Field(default=False)
    is_festival: bool = Field(default=False)


class DayPlan(BaseModel):
    date: str
    day_name: str
    recommended_mode: str
    variant: str | None
    cost_inr: float
    cost_min_inr: float
    cost_max_inr: float
    cost_display: str
    surge_multiplier: float
    time_min: int
    risk_level: str
    reason: str
    is_festival: bool = False
    festival_name: str | None = None
    weather_desc: str = "Clear"
    weather_code: int = 0
    is_raining: bool = False
    cab_cost_inr: float = 0.0
    savings_vs_cab: float = 0.0


class WeeklyPlanResponse(BaseModel):
    weekly_plan: list[DayPlan]
    cheapest_mode: str
    total_estimated_cost_inr: float
    total_cab_cost_inr: float
    total_savings_inr: float


# ── Holiday fetcher ───────────────────────────────────────────

def _fetch_indian_holidays(start_date: date, end_date: date) -> dict[str, str]:
    if not settings.GOOGLE_MAPS_BACKEND_KEY:
        return {}
    try:
        time_min = f"{start_date.isoformat()}T00:00:00Z"
        time_max = f"{end_date.isoformat()}T23:59:59Z"
        url = (
            f"https://www.googleapis.com/calendar/v3/calendars/"
            f"{INDIAN_HOLIDAYS_CALENDAR_ID}/events"
        )
        resp = httpx.get(url, params={
            "key": settings.GOOGLE_MAPS_BACKEND_KEY,
            "timeMin": time_min,
            "timeMax": time_max,
            "singleEvents": "true",
            "orderBy": "startTime",
        }, timeout=5.0)
        if resp.status_code != 200:
            return {}
        data = resp.json()
        holidays: dict[str, str] = {}
        for event in data.get("items", []):
            start = event.get("start", {})
            event_date = start.get("date") or start.get("dateTime", "")[:10]
            name = event.get("summary", "Holiday")
            if event_date:
                holidays[event_date] = name
        return holidays
    except Exception:
        return {}


# ── Weather forecast fetcher ──────────────────────────────────

def _fetch_weather_forecast(lat: float, lon: float, days: int = 7) -> list[dict]:
    try:
        url = "https://api.open-meteo.com/v1/forecast"
        resp = httpx.get(url, params={
            "latitude": lat,
            "longitude": lon,
            "daily": "weathercode,precipitation_sum",
            "timezone": "Asia/Kolkata",
            "forecast_days": days,
        }, timeout=5.0)
        if resp.status_code != 200:
            return []
        data = resp.json()
        daily = data.get("daily", {})
        dates = daily.get("time", [])
        codes = daily.get("weathercode", [])
        precip = daily.get("precipitation_sum", [])
        result = []
        for i, d in enumerate(dates):
            code = codes[i] if i < len(codes) else 0
            rain = precip[i] if i < len(precip) else 0.0
            result.append({
                "date": d,
                "code": code,
                "is_raining": code >= 51 or (rain is not None and rain > 1.0),
                "desc": _weather_code_to_desc(code),
            })
        return result
    except Exception:
        return []


def _weather_code_to_desc(code: int) -> str:
    if code == 0:
        return "Clear"
    if code <= 3:
        return "Partly Cloudy"
    if code <= 49:
        return "Foggy"
    if code <= 67:
        return "Rainy"
    if code <= 77:
        return "Snowy"
    if code <= 82:
        return "Showers"
    if code <= 99:
        return "Thunderstorm"
    return "Clear"


def _mode_label(mode: str, variant: str | None) -> str:
    return f"cab_{variant}" if mode == "cab" and variant else mode


def _pick_best_mode(costs: list, risk_level: str, is_festival: bool, is_raining: bool) -> Any:
    available = [c for c in costs if c.available]
    if not available:
        return costs[0]
    if risk_level == "high":
        fixed = [c for c in available if c.mode in {"metro", "bus"}]
        if fixed:
            return min(fixed, key=lambda c: c.time_min)
    return min(available, key=lambda c: c.final_cost_inr)


def _get_cab_cost(costs: list) -> float:
    cab_options = [c for c in costs if c.mode == "cab" and c.available]
    if cab_options:
        return min(c.final_cost_inr for c in cab_options)
    available = [c for c in costs if c.available]
    if available:
        return max(c.final_cost_inr for c in available)
    return 0.0


def _reason(mode: str, surge: float, risk_level: str, is_festival: bool, is_raining: bool) -> str:
    if is_festival and mode in {"metro", "bus"}:
        return "Festival day — fixed-schedule recommended to avoid surge"
    if is_raining and mode in {"metro", "bus"}:
        return "Rain forecast — fixed-schedule avoids cab surge"
    if mode in {"metro", "bus"}:
        return "Fixed schedule — best choice for reliability"
    if risk_level == "high":
        return "High cancellation risk — fixed-schedule modes recommended"
    if surge > 1.0:
        return f"Surge active ({surge}x) — cost elevated"
    return "Lowest cost for current conditions"


@router.post("/weekly-plan", response_model=WeeklyPlanResponse)
def weekly_plan(body: WeeklyPlanRequest, session: SessionDep) -> Any:
    try:
        dep_hour, _ = map(int, body.departure_time.split(":"))
    except ValueError:
        dep_hour = 8

    wx = weather_svc.get_weather()

    # Routes API called once — distance doesn't change across days
    distance_km, _ = get_road_distance(
        body.origin_lat, body.origin_lon,
        body.dest_lat, body.dest_lon,
    )

    plan: list[DayPlan] = []

    for offset in range(7):
        day = today + timedelta(days=offset)
        dow = day.weekday()

        demand_info = demand_svc.get_demand_for_location(
            session, body.origin_lat, body.origin_lon, dep_hour, dow
        )

        # Boost risk on festival days
        effective_risk = demand_info.risk_level
        if is_festival and effective_risk == "low":
            effective_risk = "moderate"

        all_costs = cost_svc.calculate_all_costs(
            distance_km, dep_hour, wx.is_raining, dow, body.passengers,
            precipitation_mm=wx.precipitation_mm,
            is_festival=body.is_festival,
        )

        best = _pick_best_mode(all_costs, demand_info.risk_level)
        mode_label = _mode_label(best.mode, best.variant)
        multiplier = 2 if body.round_trip else 1

        plan.append(DayPlan(
            date=date_str,
            day_name=_DAY_NAMES[dow],
            recommended_mode=_mode_label(best.mode, best.variant),
            variant=best.variant,
            cost_inr=round(best.final_cost_inr * multiplier, 2),
            cost_min_inr=round(best.cost_min_inr * multiplier, 2),
            cost_max_inr=round(best.cost_max_inr * multiplier, 2),
            cost_display=f"₹{round(best.cost_min_inr * multiplier)}–₹{round(best.cost_max_inr * multiplier)}",
            surge_multiplier=best.surge_multiplier,
            time_min=best.time_min,
            risk_level=effective_risk,
            reason=_reason(best.mode, best.surge_multiplier, effective_risk, is_festival, is_raining),
            is_festival=is_festival,
            festival_name=festival_name,
            weather_desc=weather_desc,
            weather_code=weather_code,
            is_raining=is_raining,
            cab_cost_inr=round(day_cab_cost, 2),
            savings_vs_cab=savings,
        ))

    total_cost = round(sum(d.cost_inr for d in plan), 2)
    mode_counts: dict[str, int] = {}
    for d in plan:
        mode_counts[d.recommended_mode] = mode_counts.get(d.recommended_mode, 0) + 1
    cheapest_mode = max(mode_counts, key=lambda m: mode_counts[m])

    return WeeklyPlanResponse(
        weekly_plan=plan,
        cheapest_mode=cheapest_mode,
        total_estimated_cost_inr=total_cost,
    )