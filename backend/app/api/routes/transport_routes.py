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
from app.services.cost import haversine_km, bus_wait_min, travel_only_min

router = APIRouter(tags=["transport"])


# ── Response models ───────────────────────────────────────────

class StopDetails(BaseModel):
    board_at: str
    alight_at: str


class TimeBreakdown(BaseModel):
    travel_min: int
    wait_min: int
    walk_min: int
    total_min: int
    label: str               # "42 mins (25 travel + 10 wait + 7 walk)"
    frequency_label: str | None = None  # "Every 10-15 mins"


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
    stop_details: StopDetails | None = None
    time_breakdown: TimeBreakdown | None = None


class AlternativesResponse(BaseModel):
    distance_km: float
    options: list[TransportOption]


class PickupSuggestion(BaseModel):
    name: str
    stop_type: str
    distance_m: int
    walk_min: int
    risk_reduction_pct: int
    lat: float = 0.0
    lon: float = 0.0


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


def _reason(mode: str, option: Any, risk_level: str, hour: int = 9, day_of_week: int = 0) -> str:
    if not option.available:
        return "Not available for selected passenger count"
    if mode == "metro":
        return "Fixed schedule — trains every 5–10 min, no surge"
    if mode == "bus":
        wait = bus_wait_min(hour, day_of_week)
        return f"Scheduled service — expect ~{wait} min wait for next bus"
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


def _is_metro_operating(hour: int) -> bool:
    """Hyderabad Metro operates 6:00 am – 11:00 pm."""
    return 6 <= hour <= 22


def _bus_wait_adjusted(hour: int, day_of_week: int, bus_stop_count: int) -> int:
    base = bus_wait_min(hour, day_of_week)
    if bus_stop_count >= 5:
        return min(base, 8)
    if bus_stop_count >= 2:
        return base
    return base + 10


def _bus_frequency_label(bus_stop_count: int, hour: int, day_of_week: int) -> str:
    is_peak = hour in {7, 8, 9, 17, 18, 19, 20} and day_of_week < 5
    if bus_stop_count >= 5:
        return "Every 10-15 mins" if is_peak else "Every 15-20 mins"
    if bus_stop_count >= 2:
        return "Every 20-30 mins"
    return "Every 45-60 mins"


def _mode_wait_min(mode: str, risk_level: str, hour: int, day_of_week: int, bus_stop_count: int) -> int:
    if mode == "metro":
        return 7
    if mode == "bus":
        return _bus_wait_adjusted(hour, day_of_week, bus_stop_count)
    if mode == "bike":
        return 5 if risk_level == "high" else 2
    if mode == "auto":
        return 8 if risk_level == "high" else 3
    if mode == "cab":
        return 10 if risk_level == "high" else 5
    return 3


def _build_time_breakdown(
    mode: str,
    variant: str | None,
    distance_km: float,
    hour: int,
    day_of_week: int,
    risk_level: str,
    board_walk_m: int = 0,
    alight_walk_m: int = 0,
    bus_stop_count: int = 3,
) -> TimeBreakdown:
    mode_key = f"cab_{variant}" if mode == "cab" and variant else mode
    travel = travel_only_min(mode_key, distance_km, hour)
    wait = _mode_wait_min(mode, risk_level, hour, day_of_week, bus_stop_count)
    walk = max(1, round((board_walk_m + alight_walk_m) / 80)) if (board_walk_m or alight_walk_m) else 0
    total = travel + wait + walk

    if walk > 0:
        label = f"{total} mins ({travel} travel + {wait} wait + {walk} walk)"
    else:
        label = f"{total} mins ({travel} travel + {wait} wait)"

    freq_label: str | None = None
    if mode == "metro":
        freq_label = "Every 5-10 mins"
    elif mode == "bus":
        freq_label = _bus_frequency_label(bus_stop_count, hour, day_of_week)

    return TimeBreakdown(
        travel_min=travel, wait_min=wait, walk_min=walk,
        total_min=total, label=label, frequency_label=freq_label,
    )


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/alternatives", response_model=AlternativesResponse)
def transport_alternatives(
    session: SessionDep,
    origin_lat: float = Query(..., ge=17.0, le=18.0),
    origin_lon: float = Query(..., ge=78.0, le=79.0),
    dest_lat: float = Query(..., ge=17.0, le=18.0),
    dest_lon: float = Query(..., ge=78.0, le=79.0),
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

    # Bus stop density for frequency estimation
    area_ctx = demand_svc.get_area_context(session, origin_lat, origin_lon)
    bus_stop_count = area_ctx.bus_stop_count_1km if area_ctx else 3

    all_costs = cost_svc.calculate_all_costs(
        distance_km, hour, is_raining, day_of_week, passengers
    )

    # Metro: unavailable if nearest station > 1.5 km or outside operating hours
    metro_nearby = transport_svc.find_nearest_stops(
        session, origin_lat, origin_lon, stop_type="metro", radius_km=1.5, max_count=1
    )
    metro_accessible = len(metro_nearby) > 0

    # Bus: unavailable if no stop within 1 km
    bus_nearby = transport_svc.find_nearest_stops(
        session, origin_lat, origin_lon, stop_type="bus", radius_km=1.0, max_count=1
    )
    bus_accessible = len(bus_nearby) > 0

    # Boarding/alighting stop details
    metro_board = transport_svc.nearest_stop_of_type(session, origin_lat, origin_lon, "metro")
    metro_alight = transport_svc.nearest_stop_of_type(session, dest_lat, dest_lon, "metro")
    bus_board = transport_svc.nearest_stop_of_type(session, origin_lat, origin_lon, "bus")
    bus_alight = transport_svc.nearest_stop_of_type(session, dest_lat, dest_lon, "bus")

    options: list[TransportOption] = []
    for c in all_costs:
        mode_risk = demand_info.risk_level if c.mode not in {"metro", "bus"} else "low"

        # Walk distances for transit modes
        board_walk_m = 0
        alight_walk_m = 0
        if c.mode == "metro":
            if metro_board: board_walk_m = metro_board.distance_m
            if metro_alight: alight_walk_m = metro_alight.distance_m
        elif c.mode == "bus":
            if bus_board: board_walk_m = bus_board.distance_m
            if bus_alight: alight_walk_m = bus_alight.distance_m

        breakdown = _build_time_breakdown(
            mode=c.mode, variant=c.variant, distance_km=distance_km,
            hour=hour, day_of_week=day_of_week, risk_level=mode_risk,
            board_walk_m=board_walk_m, alight_walk_m=alight_walk_m,
            bus_stop_count=bus_stop_count,
        )

        # Stop details card info
        stop_details: StopDetails | None = None
        if c.mode == "metro" and metro_board and metro_alight:
            stop_details = StopDetails(
                board_at=f"{metro_board.name} ({metro_board.distance_m}m walk)",
                alight_at=f"{metro_alight.name} ({metro_alight.distance_m}m walk)",
            )
        elif c.mode == "bus" and bus_board and bus_alight:
            stop_details = StopDetails(
                board_at=f"{bus_board.name} ({bus_board.distance_m}m walk)",
                alight_at=f"{bus_alight.name} ({bus_alight.distance_m}m walk)",
            )

        # Availability checks
        if c.mode == "metro" and not metro_accessible:
            available, reason = False, "No metro station within 1.5 km"
        elif c.mode == "metro" and not _is_metro_operating(hour):
            available, reason = False, "Metro closed — operates 6:00 am to 11:00 pm"
        elif c.mode == "bus" and not bus_accessible:
            available, reason = False, "No bus stop within 1 km"
        elif not c.available:
            available, reason = False, "Not available for selected passenger count"
        else:
            available = True
            reason = _reason(c.mode, c, demand_info.risk_level, hour, day_of_week)

        options.append(TransportOption(
            mode=c.mode,
            variant=c.variant,
            time_min=breakdown.total_min if available else c.time_min,
            cost_inr=c.final_cost_inr,
            surge_multiplier=c.surge_multiplier,
            risk_level=mode_risk,
            reliability_score=10 if c.mode in {"metro", "bus"} else rel_score,
            available=available,
            reason=reason,
            vehicles_needed=c.vehicles_needed,
            stop_details=stop_details if available else None,
            time_breakdown=breakdown if available else None,
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
            lat=stop.latitude,
            lon=stop.longitude,
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
