"""
Transport API — alternatives, optimal pickup point, journey cost breakdown.
All endpoints are public (no auth required).
"""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.api.deps import SessionDep
from app.services import cost as cost_svc
from app.services import demand as demand_svc
from app.services import transport as transport_svc
from app.services import weather as weather_svc
from app.services.cost import haversine_km

router = APIRouter(tags=["transport"])


# ── Response models ───────────────────────────────────────────

class TransportOption(BaseModel):
    mode: str
    variant: str | None
    time_min: int
    cost_inr: float
    surge_multiplier: float
    risk_level: str
    reliability_score: int      # 1–10
    available: bool
    reason: str
    vehicles_needed: int = 1


class AlternativesResponse(BaseModel):
    distance_km: float
    options: list[TransportOption]


class PickupSuggestion(BaseModel):
    name: str
    stop_type: str
    distance_m: int
    walk_min: int
    risk_reduction_pct: int


class OptimalPickupResponse(BaseModel):
    suggestions: list[PickupSuggestion]


class CostEntry(BaseModel):
    mode: str
    variant: str | None
    base_cost_inr: float
    surge_multiplier: float
    final_cost_inr: float
    time_min: int
    available: bool


class JourneyCostResponse(BaseModel):
    distance_km: float
    is_raining: bool
    costs: list[CostEntry]


# ── Helpers ───────────────────────────────────────────────────

def _reliability_score(cancel_rate: float) -> int:
    return max(1, min(10, round((1.0 - cancel_rate) * 10)))


def _reason(mode: str, option: Any, risk_level: str) -> str:
    if not option.available:
        return "Not available for selected passenger count"
    if mode in {"metro", "bus"}:
        return "Fixed schedule — unaffected by traffic or surge"
    if option.vehicles_needed > 1:
        suffix = f"{option.vehicles_needed} vehicles needed"
        if risk_level == "high":
            return f"High cancellation risk · {suffix}"
        if option.surge_multiplier > 1.0:
            return f"Surge pricing active ({option.surge_multiplier}x) · {suffix}"
        return suffix
    if risk_level == "high":
        return "High cancellation risk — consider metro/bus"
    if option.surge_multiplier > 1.0:
        return f"Surge pricing active ({option.surge_multiplier}x)"
    return "Normal conditions"


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/alternatives", response_model=AlternativesResponse)
def transport_alternatives(
    session: SessionDep,
    origin_lat: float = Query(...),
    origin_lon: float = Query(...),
    dest_lat: float = Query(...),
    dest_lon: float = Query(...),
    passengers: int = Query(default=1, ge=1, le=12),
    hour: int = Query(..., ge=0, le=23),
    day_of_week: int = Query(..., ge=0, le=6),
    is_raining: bool = Query(default=False),
) -> Any:
    """
    Return cost and time estimates for all transport modes between two coordinates.
    """
    distance_km = haversine_km(origin_lat, origin_lon, dest_lat, dest_lon)

    demand_info = demand_svc.get_demand_for_location(
        session, origin_lat, origin_lon, hour, day_of_week
    )
    rel_score = _reliability_score(demand_info.cancel_rate)

    all_costs = cost_svc.calculate_all_costs(
        distance_km, hour, is_raining, day_of_week, passengers
    )

    metro_nearby = transport_svc.find_nearest_stops(
        session, origin_lat, origin_lon, stop_type="metro", radius_km=1.0, max_count=1
    )
    metro_accessible = len(metro_nearby) > 0

    options: list[TransportOption] = []
    for c in all_costs:
        if c.mode == "metro" and not metro_accessible:
            options.append(TransportOption(
                mode=c.mode,
                variant=c.variant,
                time_min=c.time_min,
                cost_inr=c.final_cost_inr,
                surge_multiplier=c.surge_multiplier,
                risk_level="low",
                reliability_score=10,
                available=False,
                reason="No metro station within 1 km",
                vehicles_needed=c.vehicles_needed,
            ))
        else:
            options.append(TransportOption(
                mode=c.mode,
                variant=c.variant,
                time_min=c.time_min,
                cost_inr=c.final_cost_inr,
                surge_multiplier=c.surge_multiplier,
                risk_level=demand_info.risk_level if c.mode not in {"metro", "bus"} else "low",
                reliability_score=10 if c.mode in {"metro", "bus"} else rel_score,
                available=c.available,
                reason=_reason(c.mode, c, demand_info.risk_level),
                vehicles_needed=c.vehicles_needed,
            ))

    return AlternativesResponse(distance_km=round(distance_km, 2), options=options)


@router.post("/optimal-pickup", response_model=OptimalPickupResponse)
def optimal_pickup(
    body: dict,
    session: SessionDep,
) -> Any:
    """
    Suggest the best nearby transit stop to start from to reduce cancellation risk.
    Body: { origin_lat, origin_lon, radius_m (default 500) }
    """
    origin_lat: float = body.get("origin_lat", 0.0)
    origin_lon: float = body.get("origin_lon", 0.0)
    radius_m: int = body.get("radius_m", 500)
    radius_km = radius_m / 1000.0

    stops = transport_svc.find_nearest_stops(
        session, origin_lat, origin_lon,
        stop_type=None, radius_km=radius_km, max_count=5
    )

    suggestions: list[PickupSuggestion] = []
    for stop in stops:
        # Metro/MMTS stops reduce cancel risk more than bus stops
        if stop.stop_type == "metro":
            risk_reduction = 35
        elif stop.stop_type == "mmts":
            risk_reduction = 25
        else:
            risk_reduction = 10

        suggestions.append(PickupSuggestion(
            name=stop.name,
            stop_type=stop.stop_type,
            distance_m=stop.distance_m,
            walk_min=stop.walk_min,
            risk_reduction_pct=risk_reduction,
        ))

    # Sort: metro first, then by distance
    suggestions.sort(key=lambda s: (0 if s.stop_type == "metro" else 1 if s.stop_type == "mmts" else 2, s.distance_m))

    return OptimalPickupResponse(suggestions=suggestions)


@router.post("/journey-cost", response_model=JourneyCostResponse)
def journey_cost(
    body: dict,
    session: SessionDep,
) -> Any:
    """
    Return full cost breakdown for all modes between two coordinates at a given datetime.
    Body: { origin_lat, origin_lon, dest_lat, dest_lon, passengers, datetime (ISO 8601) }
    """
    origin_lat: float = body.get("origin_lat", 0.0)
    origin_lon: float = body.get("origin_lon", 0.0)
    dest_lat: float = body.get("dest_lat", 0.0)
    dest_lon: float = body.get("dest_lon", 0.0)
    passengers: int = body.get("passengers", 1)

    dt_str: str | None = body.get("datetime")
    if dt_str:
        try:
            dt = datetime.fromisoformat(dt_str)
            hour = dt.hour
            day_of_week = dt.weekday()
        except ValueError:
            now = datetime.now()
            hour = now.hour
            day_of_week = now.weekday()
    else:
        now = datetime.now()
        hour = now.hour
        day_of_week = now.weekday()

    wx = weather_svc.get_weather()
    distance_km = haversine_km(origin_lat, origin_lon, dest_lat, dest_lon)

    all_costs = cost_svc.calculate_all_costs(
        distance_km, hour, wx.is_raining, day_of_week, passengers
    )

    costs = [
        CostEntry(
            mode=c.mode,
            variant=c.variant,
            base_cost_inr=c.base_cost_inr,
            surge_multiplier=c.surge_multiplier,
            final_cost_inr=c.final_cost_inr,
            time_min=c.time_min,
            available=c.available,
        )
        for c in all_costs
    ]

    return JourneyCostResponse(
        distance_km=round(distance_km, 2),
        is_raining=wx.is_raining,
        costs=costs,
    )
