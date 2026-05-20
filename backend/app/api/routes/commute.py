"""
Commute API — weekly commute plan.
Single endpoint, no auth required.

Routes API called once per request — distance reused across all 7 days.
Surge applied per-day based on day_of_week and live weather.
"""

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.deps import SessionDep
from app.services import cost as cost_svc
from app.services import demand as demand_svc
from app.services import weather as weather_svc
from app.services.routes_service import get_road_distance

router = APIRouter(tags=["commute"])

_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


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


class WeeklyPlanResponse(BaseModel):
    weekly_plan: list[DayPlan]
    cheapest_mode: str
    total_estimated_cost_inr: float


def _mode_label(mode: str, variant: str | None) -> str:
    return f"cab_{variant}" if mode == "cab" and variant else mode


def _pick_best_mode(costs: list, risk_level: str) -> Any:
    available = [c for c in costs if c.available]
    if not available:
        return costs[0]
    if risk_level == "high":
        fixed = [c for c in available if c.mode in {"metro", "bus"}]
        if fixed:
            return min(fixed, key=lambda c: c.time_min)
    return min(available, key=lambda c: c.final_cost_inr)


def _reason(mode: str, surge: float, risk_level: str) -> str:
    if mode in {"metro", "bus"}:
        return "Fixed schedule — best choice for high-risk or rainy conditions"
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

    today = date.today()
    plan: list[DayPlan] = []

    for offset in range(7):
        day = today + timedelta(days=offset)
        dow = day.weekday()

        demand_info = demand_svc.get_demand_for_location(
            session, body.origin_lat, body.origin_lon, dep_hour, dow
        )

        all_costs = cost_svc.calculate_all_costs(
            distance_km, dep_hour, wx.is_raining, dow, body.passengers,
            precipitation_mm=wx.precipitation_mm,
            is_festival=body.is_festival,
        )

        best = _pick_best_mode(all_costs, demand_info.risk_level)
        mode_label = _mode_label(best.mode, best.variant)
        multiplier = 2 if body.round_trip else 1

        plan.append(DayPlan(
            date=day.isoformat(),
            day_name=_DAY_NAMES[dow],
            recommended_mode=mode_label,
            variant=best.variant,
            cost_inr=round(best.final_cost_inr * multiplier, 2),
            cost_min_inr=round(best.cost_min_inr * multiplier, 2),
            cost_max_inr=round(best.cost_max_inr * multiplier, 2),
            cost_display=f"₹{round(best.cost_min_inr * multiplier)}–₹{round(best.cost_max_inr * multiplier)}",
            surge_multiplier=best.surge_multiplier,
            time_min=best.time_min,
            risk_level=demand_info.risk_level,
            reason=_reason(best.mode, best.surge_multiplier, demand_info.risk_level),
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