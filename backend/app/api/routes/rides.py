"""
Rides API — cancellation prediction, route reliability, best-time-to-leave.
All endpoints are public (no auth required); predictions are persisted for analytics.
"""

import uuid
from math import atan2, cos, radians, sin, sqrt
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import select

from app.api.deps import SessionDep
from app.models import AreaContext, RidePrediction, User
from app.services import demand, weather
from app.services.ml_model import RideFeatures, predict as ml_predict

router = APIRouter(tags=["rides"])


# ── Helpers ───────────────────────────────────────────────────

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def _nearest_area(session, lat: float, lon: float) -> AreaContext | None:
    areas = session.exec(select(AreaContext)).all()
    if not areas:
        return None
    return min(areas, key=lambda z: _haversine_km(lat, lon, z.latitude, z.longitude))


def _is_peak(hour: int, day_of_week: int) -> bool:
    return hour in {8, 9, 18, 19, 20} and day_of_week < 5


# ── Request / Response models ─────────────────────────────────

class PredictRequest(BaseModel):
    origin_lat: float
    origin_lon: float
    dest_lat: float
    dest_lon: float
    hour: int = Field(..., ge=0, le=23)
    day_of_week: int = Field(..., ge=0, le=6)
    month: int = Field(..., ge=1, le=12)
    override_rain: bool | None = None
    user_id: uuid.UUID | None = None


class FactorItem(BaseModel):
    factor: str
    impact: str   # positive | negative | neutral
    detail: str


class PredictResponse(BaseModel):
    risk_level: str
    probability: float
    is_raining: bool
    weather_conditions: str
    cancel_rate: float
    demand_score: float
    driver_supply: int
    factors: list[FactorItem]
    using_ml_model: bool


class RouteReliabilityResponse(BaseModel):
    score: int          # 1–10 (10 = most reliable)
    label: str          # Reliable | Moderate | Unreliable
    cancel_rate: float
    avg_wait_min: int
    surge_frequency: str
    recommended_modes: list[str]


class TimeSlot(BaseModel):
    hour: int
    time_label: str
    color: str          # green | yellow | red
    cancel_risk: float
    surge: float
    risk_level: str


class BestTimeResponse(BaseModel):
    slots: list[TimeSlot]
    best_slot: TimeSlot | None


# ── Factor builder ────────────────────────────────────────────

def _build_factors(
    features: RideFeatures,
    is_raining: bool,
    demand_info: Any,
) -> list[FactorItem]:
    factors: list[FactorItem] = []
    if is_raining:
        factors.append(FactorItem(
            factor="Rain", impact="negative",
            detail="Rain detected — cancellations spike ~25%",
        ))
    if features.hour in {7, 8, 9, 18, 19, 20}:
        factors.append(FactorItem(
            factor="Peak hour", impact="negative",
            detail="High-demand window — driver supply constrained",
        ))
    if features.traffic_chokepoint_nearby:
        factors.append(FactorItem(
            factor="Traffic chokepoint", impact="negative",
            detail="Route passes through high-congestion area",
        ))
    if features.is_flood_prone:
        factors.append(FactorItem(
            factor="Flood-prone zone", impact="negative",
            detail="Area has a history of flooding during rain",
        ))
    if features.metro_count_1km > 0:
        factors.append(FactorItem(
            factor="Metro nearby", impact="positive",
            detail=f"{features.metro_count_1km} metro station(s) within 1 km — reliable alternative",
        ))
    if demand_info.driver_supply > 8:
        factors.append(FactorItem(
            factor="Good driver supply", impact="positive",
            detail="High driver availability for this area and time",
        ))
    return factors


# ── Endpoints ─────────────────────────────────────────────────

@router.post("/predict-cancellation", response_model=PredictResponse)
def predict_cancellation(body: PredictRequest, session: SessionDep) -> Any:
    """
    Predict ride cancellation risk for an origin–destination at a given time.
    Combines ML/rule-based model, live weather, and historical demand data.
    Result is persisted for analytics. Pass user_id to associate with an account.
    """
    wx = weather.get_weather()
    is_raining = body.override_rain if body.override_rain is not None else wx.is_raining

    demand_info = demand.get_demand_for_location(
        session, body.origin_lat, body.origin_lon, body.hour, body.day_of_week
    )

    area = _nearest_area(session, body.origin_lat, body.origin_lon)

    features = RideFeatures(
        hour=body.hour,
        day_of_week=body.day_of_week,
        month=body.month,
        metro_count_1km=area.metro_count_1km if area else 0,
        bus_stop_count_1km=area.bus_stop_count_1km if area else 0,
        traffic_chokepoint_nearby=area.traffic_chokepoint_nearby if area else False,
        is_flood_prone=area.is_flood_prone if area else False,
        commercial_density_1km=area.commercial_density_1km if area else 0,
        nearest_metro_distance_km=area.nearest_metro_distance_km if area else 5.0,
        historical_cancel_rate=demand_info.cancel_rate,
    )

    if body.user_id is not None and not session.get(User, body.user_id):
        raise HTTPException(status_code=422, detail=f"user_id {body.user_id} does not exist")

    result = ml_predict(features, is_raining)

    session.add(RidePrediction(
        origin_lat=body.origin_lat,
        origin_lon=body.origin_lon,
        dest_lat=body.dest_lat,
        dest_lon=body.dest_lon,
        predicted_risk=result.risk_level,
        probability=result.probability,
        is_raining=is_raining,
        user_id=body.user_id,
    ))
    session.commit()

    return PredictResponse(
        risk_level=result.risk_level,
        probability=result.probability,
        is_raining=is_raining,
        weather_conditions=wx.conditions,
        cancel_rate=demand_info.cancel_rate,
        demand_score=demand_info.demand_score,
        driver_supply=demand_info.driver_supply,
        factors=_build_factors(features, is_raining, demand_info),
        using_ml_model=not result.using_fallback,
    )


@router.get("/route-reliability", response_model=RouteReliabilityResponse)
def route_reliability(
    session: SessionDep,
    origin_lat: float = Query(...),
    origin_lon: float = Query(...),
    dest_lat: float = Query(...),
    dest_lon: float = Query(...),
    hour: int = Query(..., ge=0, le=23),
    day_of_week: int = Query(..., ge=0, le=6),
) -> Any:
    """
    Return a 1–10 reliability score for a route at a given time.
    """
    demand_info = demand.get_demand_for_location(
        session, origin_lat, origin_lon, hour, day_of_week
    )

    score = max(1, min(10, round((1.0 - demand_info.cancel_rate) * 10)))
    if score >= 7:
        label = "Reliable"
    elif score >= 4:
        label = "Moderate"
    else:
        label = "Unreliable"

    avg_wait_min = max(3, round(demand_info.cancel_rate * 20))

    if demand_info.risk_level == "high" or demand_info.cancel_rate > 0.55:
        recommended_modes = ["metro", "bus"]
    else:
        recommended_modes = ["cab_mini", "auto", "metro"]

    surge_frequency = "Daily (weekday peak)" if day_of_week < 5 else "Low (weekend)"

    return RouteReliabilityResponse(
        score=score,
        label=label,
        cancel_rate=demand_info.cancel_rate,
        avg_wait_min=avg_wait_min,
        surge_frequency=surge_frequency,
        recommended_modes=recommended_modes,
    )


@router.get("/best-time-to-leave", response_model=BestTimeResponse)
def best_time_to_leave(
    session: SessionDep,
    origin_lat: float = Query(...),
    origin_lon: float = Query(...),
    dest_lat: float = Query(...),
    dest_lon: float = Query(...),
    current_hour: int = Query(..., ge=0, le=23, description="Current hour (0–23)"),
    day_of_week: int = Query(..., ge=0, le=6),
    lookahead_hours: int = Query(default=6, ge=1, le=12),
) -> Any:
    """
    Scan the next N hours and colour-code each slot (green/yellow/red).
    Returns the earliest green or yellow slot as the recommended departure.
    """
    wx = weather.get_weather()
    slots: list[TimeSlot] = []

    for offset in range(lookahead_hours):
        total = current_hour + offset
        h = total % 24
        d = (day_of_week + total // 24) % 7

        demand_info = demand.get_demand_for_location(session, origin_lat, origin_lon, h, d)

        peak = _is_peak(h, d)
        surge = 2.0 if (wx.is_raining or peak) else 1.0

        if demand_info.cancel_rate < 0.40 and not (wx.is_raining and peak):
            color = "green"
        elif demand_info.cancel_rate < 0.60 and not (wx.is_raining and peak):
            color = "yellow"
        else:
            color = "red"

        slots.append(TimeSlot(
            hour=h,
            time_label=f"{h:02d}:00",
            color=color,
            cancel_risk=demand_info.cancel_rate,
            surge=surge,
            risk_level=demand_info.risk_level,
        ))

    best = next((s for s in slots if s.color == "green"), None)
    if best is None:
        best = next((s for s in slots if s.color == "yellow"), None)

    return BestTimeResponse(slots=slots, best_slot=best)
