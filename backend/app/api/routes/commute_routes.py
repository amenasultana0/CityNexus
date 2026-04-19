"""
Commute API — weekly commute plan.
Single endpoint, no auth required.
"""

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.deps import SessionDep
from app.services import cost as cost_svc
from app.services import demand as demand_svc
from app.services import weather as weather_svc
from app.services.cost import haversine_km

router = APIRouter(tags=["commute"])

_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


# ── Request / Response models ─────────────────────────────────

class WeeklyPlanRequest(BaseModel):
    origin_lat: float = Field(ge=17.0, le=18.0)
    origin_lon: float = Field(ge=78.0, le=79.0)
    dest_lat: float = Field(ge=17.0, le=18.0)
    dest_lon: float = Field(ge=78.0, le=79.0)
    passengers: int = Field(default=1, ge=1, le=6)
    departure_time: str = Field(..., description="HH:MM — daily departure time")
    round_trip: bool = Field(default=False)


class DayPlan(BaseModel):
    date: str           # YYYY-MM-DD
    day_name: str
    recommended_mode: str
    variant: str | None
    cost_inr: float
    surge_multiplier: float
    time_min: int
    risk_level: str
    reason: str


class WeeklyPlanResponse(BaseModel):
    weekly_plan: list[DayPlan]
    cheapest_mode: str
    total_estimated_cost_inr: float


# ── Helpers ───────────────────────────────────────────────────

def _mode_label(mode: str, variant: str | None) -> str:
    if mode == "cab" and variant:
        return f"cab_{variant}"
    return mode


def _pick_best_mode(costs: list, risk_level: str) -> Any:
    available = [c for c in costs if c.available]
    if not available:
        return costs[0]  # fallback

    # If high risk, prefer fixed-schedule modes
    if risk_level == "high":
        fixed = [c for c in available if c.mode in {"metro", "bus"}]
        if fixed:
            return min(fixed, key=lambda c: c.time_min)

    # Otherwise pick cheapest available
    return min(available, key=lambda c: c.final_cost_inr)


def _reason(mode: str, surge: float, risk_level: str) -> str:
    if mode in {"metro", "bus"}:
        return "Fixed schedule — best choice for high-risk or rainy conditions"
    if risk_level == "high":
        return "High cancellation risk — fixed-schedule modes recommended"
    if surge > 1.0:
        return f"Surge active ({surge}x) — cost elevated"
    return "Lowest cost for current conditions"


# ── Endpoint ──────────────────────────────────────────────────

@router.post("/weekly-plan", response_model=WeeklyPlanResponse)
def weekly_plan(body: WeeklyPlanRequest, session: SessionDep) -> Any:
    """
    Generate a 7-day commute plan starting from today.
    For each day, recommends the best transport mode based on cost, risk,
    and current weather (weather is the same for all days as it uses live data).
    """
    try:
        dep_hour, dep_minute = map(int, body.departure_time.split(":"))
    except ValueError:
        dep_hour, dep_minute = 8, 0

    wx = weather_svc.get_weather()
    distance_km = haversine_km(
        body.origin_lat, body.origin_lon, body.dest_lat, body.dest_lon
    )

    today = date.today()
    plan: list[DayPlan] = []

    for offset in range(7):
        day = today + timedelta(days=offset)
        dow = day.weekday()   # 0=Mon … 6=Sun

        demand_info = demand_svc.get_demand_for_location(
            session, body.origin_lat, body.origin_lon, dep_hour, dow
        )

        all_costs = cost_svc.calculate_all_costs(
            distance_km, dep_hour, wx.is_raining, dow, body.passengers
        )

        best = _pick_best_mode(all_costs, demand_info.risk_level)
        mode_label = _mode_label(best.mode, best.variant)

        day_cost = best.final_cost_inr * (2 if body.round_trip else 1)
        plan.append(DayPlan(
            date=day.isoformat(),
            day_name=_DAY_NAMES[dow],
            recommended_mode=mode_label,
            variant=best.variant,
            cost_inr=day_cost,
            surge_multiplier=best.surge_multiplier,
            time_min=best.time_min,
            risk_level=demand_info.risk_level,
            reason=_reason(best.mode, best.surge_multiplier, demand_info.risk_level),
        ))

    total_cost = round(sum(d.cost_inr for d in plan), 2)

    # Most frequently recommended mode
    mode_counts: dict[str, int] = {}
    for d in plan:
        mode_counts[d.recommended_mode] = mode_counts.get(d.recommended_mode, 0) + 1
    cheapest_mode = max(mode_counts, key=lambda m: mode_counts[m])

    return WeeklyPlanResponse(
        weekly_plan=plan,
        cheapest_mode=cheapest_mode,
        total_estimated_cost_inr=total_cost,
    )
