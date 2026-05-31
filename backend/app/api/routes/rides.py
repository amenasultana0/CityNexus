"""
Rides API — cancellation prediction, route reliability, best-time-to-leave.
All endpoints are public (no auth required); predictions are persisted for analytics.
"""

import uuid
from math import atan2, cos, radians, sin, sqrt
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import select

from datetime import datetime, timedelta
from app.services.cost import calculate_available_costs, travel_only_min
from app.services.routes_service import get_road_distance
from app.services import demand as demand_svc

from app.api.deps import SessionDep
from app.models import AreaContext, RidePrediction, User
from app.services import demand, weather
from app.services.ml_model import RideFeatures, hybrid_predict, predict_cancellation_risk

router = APIRouter(tags=["rides"])

_ROAD_FACTOR = 1.4  # Haversine → road distance correction for Hyderabad


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

# Add these to the models section of rides.py
 
class PlanTripRequest(BaseModel):
    origin_lat: float
    origin_lon: float
    dest_lat: float
    dest_lon: float
    arrive_by_hour: int      # 0–23, local time
    arrive_by_minute: int    # 0–59
    day_offset: int = 1      # 0 = today, 1 = tomorrow, 2 = day after
 
 
class SlotRecommendation(BaseModel):
    label: Literal["balanced", "cheapest", "fastest"]
    leave_hour: int
    leave_minute: int
    leave_time_label: str        # e.g. "8:05 AM"
    arrive_time_label: str       # e.g. "8:47 AM"
    buffer_min: int
    fare_inr: int
    fare_display: str            # e.g. "₹132–₹152"
    duration_min: int
    mode: str                    # Auto | Bike | Mini | Sedan | SUV | Metro | Bus
    surge_multiplier: float
    availability: str            # High | Moderate | Low
    reasons: list[str]
 
 
class ForecastAlert(BaseModel):
    type: Literal["traffic", "rain", "surge", "availability"]
    text: str
 
 
class ConfidenceLevel(BaseModel):
    label: Literal["High confidence", "Moderate confidence", "Conditions may change"]
    detail: str
 
 
class PlanTripResponse(BaseModel):
    best: SlotRecommendation
    alternatives: list[SlotRecommendation]   # cheapest + fastest (may overlap with best)
    alerts: list[ForecastAlert]
    confidence: ConfidenceLevel
    metro_tip: str | None                    # shown if metro saves significant time
 

# ── Helpers ───────────────────────────────────────────────────
 
def _fmt_time(hour: int, minute: int) -> str:
    h12 = hour % 12 or 12
    ampm = "AM" if hour < 12 else "PM"
    return f"{h12}:{minute:02d} {ampm}"
 
 
def _availability_label(driver_supply: int, demand_score: float) -> str:
    if driver_supply >= 8 and demand_score < 0.5:
        return "High"
    if driver_supply >= 4 or demand_score < 0.7:
        return "Moderate"
    return "Low"
 
 
def _mode_label(mode: str, variant: str | None) -> str:
    if mode == "cab":
        return {"mini": "Mini", "sedan": "Sedan", "suv": "SUV"}.get(variant or "", "Cab")
    return mode.capitalize()
 
 
def _get_hourly_precip_forecast(n_hours: int, start_hour: int) -> list[float]:
    """
    Fetch Open-Meteo hourly precipitation for today+tomorrow and return
    a list of precipitation_mm values for start_hour .. start_hour+n_hours.
    Returns zeros on failure — callers must handle gracefully.
    """
    import httpx
    _HYD_LAT, _HYD_LON = 17.385, 78.486
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={_HYD_LAT}&longitude={_HYD_LON}"
        f"&hourly=precipitation&forecast_days=2&timezone=Asia%2FKolkata"
    )
    try:
        resp = httpx.get(url, timeout=5.0)
        resp.raise_for_status()
        data = resp.json()
        precip_list = data["hourly"]["precipitation"]   # 48 values, hour 0..47
        result = []
        for offset in range(n_hours):
            idx = start_hour + offset
            if 0 <= idx < len(precip_list):
                result.append(float(precip_list[idx]))
            else:
                result.append(0.0)
        return result
    except Exception:
        return [0.0] * n_hours
 
 
def _pick_best_mode(costs) -> object:
    """
    From a list of CostResult pick the single best mode for an important trip:
    prefer metro if available and competitive, else lowest-fare available cab/auto.
    """
    available = [c for c in costs if c.available]
    if not available:
        return None
    # Metro is always punctual — prefer it if fare is reasonable
    metro = next((c for c in available if c.mode == "metro"), None)
    non_metro = [c for c in available if c.mode != "metro" and c.mode != "bus"]
    if not non_metro:
        return metro or available[0]
    cheapest_non_metro = min(non_metro, key=lambda c: c.final_cost_inr)
    if metro and metro.time_min <= cheapest_non_metro.time_min * 1.2:
        return metro
    return cheapest_non_metro
 
 
def _build_slot(
    label: str,
    leave_hour: int,
    leave_minute: int,
    arrive_hour: int,
    arrive_minute: int,
    buffer_min: int,
    cost,
    demand_info,
    area,
    reasons: list[str],
) -> SlotRecommendation:
    return SlotRecommendation(
        label=label,
        leave_hour=leave_hour,
        leave_minute=leave_minute,
        leave_time_label=_fmt_time(leave_hour, leave_minute),
        arrive_time_label=_fmt_time(arrive_hour, arrive_minute),
        buffer_min=buffer_min,
        fare_inr=int(cost.final_cost_inr),
        fare_display=cost.cost_display,
        duration_min=cost.time_min,
        mode=_mode_label(cost.mode, cost.variant),
        surge_multiplier=cost.surge_multiplier,
        availability=_availability_label(demand_info.driver_supply, demand_info.demand_score),
        reasons=reasons[:2],
    )
 
 
def _build_reasons(
    hour: int,
    day_of_week: int,
    demand_info,
    area,
    precip_mm: float,
    surge: float,
) -> list[str]:
    reasons = []
    is_peak = hour in {7, 8, 9, 10, 17, 18, 19, 20} and day_of_week < 5
    is_night = hour >= 23 or hour < 5
 
    if surge <= 1.0:
        reasons.append("No surge — good time to book")
    elif surge <= 1.15:
        reasons.append("Mild surge — fares slightly higher than base")
    else:
        reasons.append(f"Surge active ({surge}x) — fares elevated")
 
    if demand_info.cancel_rate < 0.35:
        reasons.append("Low cancellation rate — good time to book")
    elif demand_info.cancel_rate > 0.60:
        metro_nearby = area and area.metro_count_1km > 0
        if metro_nearby:
            reasons.append("High cancellation rate — book early or use metro")
        else:
            reasons.append("High cancellation rate — book early or consider bus") 
    if is_peak:
        reasons.append("Peak traffic window — allow extra buffer")
 
    if precip_mm >= 8:
        reasons.append("Heavy rain forecast — expect delays and higher fares")
    elif precip_mm >= 2:
        reasons.append("Light rain forecast — minor fare increase likely")
 
    if area and area.traffic_chokepoint_nearby:
        reasons.append("Route passes a known traffic chokepoint")
 
    if demand_info.driver_supply <= 3:
        reasons.append("Low driver supply expected at this hour")
 
    if is_night:
        reasons.append("Night rates apply — slight fare increase")
 
    return reasons
 
 
# ── Buffer logic ───────────────────────────────────────────────
 
def _recommended_buffer(cancel_rate: float, is_peak: bool, precip_mm: float, area) -> int:
    """Return a buffer in minutes to add on top of travel time."""
    buf = 10  # baseline
    if cancel_rate > 0.55:
        buf += 10
    if is_peak:
        buf += 5
    if precip_mm >= 2:
        buf += 5
    if area and area.traffic_chokepoint_nearby:
        buf += 5
    if area and area.is_flood_prone and precip_mm >= 2:
        buf += 10
    return buf
 
 
# ── Confidence scoring ─────────────────────────────────────────
 
def _confidence(cancel_rate: float, precip_mm: float, demand_score: float) -> ConfidenceLevel:
    if cancel_rate < 0.40 and precip_mm < 2 and demand_score < 0.6:
        return ConfidenceLevel(
            label="High confidence",
            detail="Stable demand, no rain forecast, low cancellation history",
        )
    if cancel_rate < 0.65 and precip_mm < 8:
        return ConfidenceLevel(
            label="Moderate confidence",
            detail="Moderate demand or minor rain expected — plan a small buffer",
        )
    return ConfidenceLevel(
        label="Conditions may change",
        detail="High cancellation history or significant rain forecast — book early",
    )
 
 
# ── Main endpoint ─────────────────────────────────────────────
 
@router.post("/plan-trip", response_model=PlanTripResponse)
def plan_trip(body: PlanTripRequest, session: SessionDep) -> PlanTripResponse:
    """
    Smart trip planner — given an arrival deadline, return the best departure
    time with fare, availability, and reliability signals.
 
    Prediction signals used:
      - Historical demand (cancel_rate, driver_supply, demand_score) per area/hour/day
      - Weather forecast (Open-Meteo hourly precipitation for next 48h)
      - Area context (chokepoint, flood-prone, metro density)
      - Surge model (time + weather additive, capped 1.35x)
      - Availability derived from driver_supply vs demand_score
    """
    from app.services.cost import calculate_available_costs, travel_only_min
    from app.services.routes_service import get_road_distance
    from app.services import demand as demand_svc
    from app.services.weather import get_weather
 
    # ── 1. Road distance (once, shared across all slots) ──────
    distance_km, routes_api_duration_min = get_road_distance(
        body.origin_lat, body.origin_lon, body.dest_lat, body.dest_lon
    )
 
    # ── 2. Fetch 48h precipitation forecast ───────────────────
    # day_offset=1 means tomorrow; we map arrive_by_hour into the 48h array
    forecast_start_hour = body.day_offset * 24  # 0=today, 24=tomorrow, 48=day after
    # fetch enough hours to cover 6h before arrival
    precip_forecast = _get_hourly_precip_forecast(
        n_hours=30,
        start_hour=max(0, forecast_start_hour + body.arrive_by_hour - 6),
    )
 
    # ── 3. Area context ───────────────────────────────────────
    area = demand_svc.get_area_context(session, body.origin_lat, body.origin_lon)
 
    # ── 4. Arrive-by as total minutes from midnight ───────────
    arrive_total_min = body.arrive_by_hour * 60 + body.arrive_by_minute
 
    # Day of week for the target date (0=Mon, 6=Sun)
    from datetime import timezone as _tz
    _IST = _tz(timedelta(hours=5, minutes=30))
    target_date = datetime.now(_IST) + timedelta(days=body.day_offset)
    day_of_week = target_date.weekday()
    
    # ── 5. Scan candidate departure slots ─────────────────────
    # Step back from arrive_by in 15-min increments for up to 3 hours
    # For each slot: compute travel time, check if it reaches in time, score it.
 
    CANDIDATES = []  # list of (leave_total_min, cost, demand_info, precip_mm, buffer)
 
    for step in range(1, 13):  # 12 × 15min = 3 hours lookahead back from arrive_by
        leave_total_min = arrive_total_min - step * 15
        if leave_total_min < 0:
            continue
 
        leave_hour = (leave_total_min // 60) % 24
        leave_minute = leave_total_min % 60
        is_peak = leave_hour in {7, 8, 9, 10, 17, 18, 19, 20} and day_of_week < 5
 
        # Precipitation for this departure hour
        precip_idx = step - 1  # rough mapping into forecast array
        precip_mm = precip_forecast[precip_idx] if precip_idx < len(precip_forecast) else 0.0
 
        # Historical demand for this slot
        d_info = demand_svc.get_demand_for_location(
            session, body.origin_lat, body.origin_lon, leave_hour, day_of_week
        )
 
        # Costs for this slot
        costs = calculate_available_costs(
            distance_km=distance_km,
            hour=leave_hour,
            is_raining=precip_mm > 0,
            day_of_week=day_of_week,
            passengers=1,
            precipitation_mm=precip_mm,
        )
        if not costs:
            continue
 
        best_cost = _pick_best_mode(costs)
        if best_cost is None:
            continue
 
        travel_min = best_cost.time_min
        buffer = _recommended_buffer(d_info.cancel_rate, is_peak, precip_mm, area)
        total_needed = travel_min + buffer
 
        # Only keep slots where there's enough time to arrive
        if leave_total_min + total_needed <= arrive_total_min:
            CANDIDATES.append((leave_total_min, best_cost, costs, d_info, precip_mm, buffer))
 
    if not CANDIDATES:
        # Fallback: earliest possible slot ignoring buffer
        leave_total_min = arrive_total_min - 60
        leave_hour = (leave_total_min // 60) % 24
        leave_minute = leave_total_min % 60
        d_info = demand_svc.get_demand_for_location(
            session, body.origin_lat, body.origin_lon, leave_hour, day_of_week
        )
        costs = calculate_available_costs(
            distance_km=distance_km,
            hour=leave_hour,
            is_raining=False,
            day_of_week=day_of_week,
            passengers=1,
            precipitation_mm=0.0,
        )
        best_cost = _pick_best_mode(costs) if costs else None
        if best_cost:
            CANDIDATES.append((leave_total_min, best_cost, costs, d_info, 0.0, 10))
 
    # ── 6. Pick balanced / cheapest / fastest ─────────────────
 
    def _score_balanced(c):
        leave_min, cost, all_costs, d_info, precip, buf = c
        # How many minutes before arrive_by this slot departs
        earliness_min = arrive_total_min - leave_min - cost.time_min
        # Penalise leaving unnecessarily early (every 10 min early = +5 score penalty)
        earliness_penalty = max(0, (earliness_min - 15) / 10) * 20
        return (
            cost.final_cost_inr * 0.4
            + d_info.cancel_rate * 200
            + (cost.surge_multiplier - 1.0) * 150
            + (1.0 - d_info.driver_supply / 10) * 50
            + earliness_penalty
        )
    
    balanced_candidate = min(CANDIDATES, key=_score_balanced)
 
    cheapest_candidate = min(CANDIDATES, key=lambda c: c[1].final_cost_inr)
 
    def _score_fastest(c):
        leave_min, cost, all_costs, d_info, precip, buf = c
        # Earlier departure + shorter travel time
        return cost.time_min + (d_info.cancel_rate * 30)
 
    fastest_candidate = min(CANDIDATES, key=_score_fastest)
 
    # ── 7. Build SlotRecommendation for each ──────────────────
 
    def _make_recommendation(label, cand):
        leave_total_min, cost, all_costs, d_info, precip_mm, buffer = cand
        leave_hour = (leave_total_min // 60) % 24
        leave_minute = leave_total_min % 60
        is_peak = leave_hour in {7, 8, 9, 10, 17, 18, 19, 20} and day_of_week < 5
 
        arrive_actual_min = leave_total_min + cost.time_min
        arrive_hour = (arrive_actual_min // 60) % 24
        arrive_minute = arrive_actual_min % 60
        buffer_remaining = arrive_total_min - arrive_actual_min
 
        reasons = _build_reasons(leave_hour, day_of_week, d_info, area, precip_mm, cost.surge_multiplier)
 
        return _build_slot(
            label=label,
            leave_hour=leave_hour,
            leave_minute=leave_minute,
            arrive_hour=arrive_hour,
            arrive_minute=arrive_minute,
            buffer_min=max(0, buffer_remaining),
            cost=cost,
            demand_info=d_info,
            area=area,
            reasons=reasons,
        )
 
    best_slot = _make_recommendation("balanced", balanced_candidate)
    cheapest_slot = _make_recommendation("cheapest", cheapest_candidate)
    fastest_slot = _make_recommendation("fastest", fastest_candidate)
 
    # Deduplicate alternatives (don't repeat balanced in the list)
    # Build a cab-only alternative so alternatives aren't all metro
   # Build a cab-only alternative so alternatives aren't all metro
    def _pick_best_cab(costs):
        cab_modes = [c for c in costs if c.available and c.mode == "cab"]
        if not cab_modes:
            # fall back to any non-metro non-bus
            cab_modes = [c for c in costs if c.available and c.mode not in ("metro", "bus")]
        if not cab_modes:
            return None
        return min(cab_modes, key=lambda c: c.final_cost_inr)
    
    # Find the candidate with the best cab option at a reasonable time
    cab_alternative = None
    for cand in sorted(CANDIDATES, key=lambda c: c[0], reverse=True):  # latest departure first
        leave_min_c, _, all_costs_c, d_info_c, precip_c, buf_c = cand
        cab_cost = _pick_best_cab(all_costs_c)
        if cab_cost is not None:
            leave_hour_c = (leave_min_c // 60) % 24
            leave_minute_c = leave_min_c % 60
            arrive_actual_c = leave_min_c + cab_cost.time_min
            arrive_hour_c = (arrive_actual_c // 60) % 24
            arrive_minute_c = arrive_actual_c % 60
            buffer_c = arrive_total_min - arrive_actual_c
            reasons_c = _build_reasons(
                leave_hour_c, day_of_week, d_info_c, area, precip_c, cab_cost.surge_multiplier
            )
            cab_alternative = SlotRecommendation(
                label="cheapest",
                leave_hour=leave_hour_c,
                leave_minute=leave_minute_c,
                leave_time_label=_fmt_time(leave_hour_c, leave_minute_c),
                arrive_time_label=_fmt_time(arrive_hour_c, arrive_minute_c),
                buffer_min=max(0, buffer_c),
                fare_inr=int(cab_cost.final_cost_inr),
                fare_display=cab_cost.cost_display,
                duration_min=cab_cost.time_min,
                mode=_mode_label(cab_cost.mode, cab_cost.variant),
                surge_multiplier=cab_cost.surge_multiplier,
                availability=_availability_label(d_info_c.driver_supply, d_info_c.demand_score),
                reasons=reasons_c[:2],
            )
            break
    
    alternatives = []
    seen_times = {(best_slot.leave_hour, best_slot.leave_minute)}
    
    # Add cab alternative if it differs from best
    if cab_alternative:
        key = (cab_alternative.leave_hour, cab_alternative.leave_minute)
        if key not in seen_times:
            alternatives.append(cab_alternative)
            seen_times.add(key)
        else:
            # same time but different mode is still useful to show
            if cab_alternative.mode != best_slot.mode:
                alternatives.append(cab_alternative)
    
    # Add fastest if it differs from both
    for slot in [fastest_slot]:
        key = (slot.leave_hour, slot.leave_minute)
        if key not in seen_times and len(alternatives) < 2:
            alternatives.append(slot)
            seen_times.add(key)
        
    # ── 8. Metro tip ──────────────────────────────────────────
    _, _, all_costs_balanced, _, _, _ = balanced_candidate
    metro_cost = next((c for c in all_costs_balanced if c.mode == "metro"), None)
    metro_tip = None
    if metro_cost and metro_cost.time_min < best_slot.duration_min * 0.85:
        saved = best_slot.duration_min - metro_cost.time_min
        metro_tip = f"Metro saves ~{saved} min during this window — no surge, fixed fare ₹{int(metro_cost.final_cost_inr)}"
 
    # ── 9. Forecast alerts ────────────────────────────────────
    alerts: list[ForecastAlert] = []
    _, _, _, d_info_best, precip_best, _ = balanced_candidate
 
    if any(p >= 8 for p in precip_forecast[:6]):
        alerts.append(ForecastAlert(type="rain", text="Heavy rain likely during travel window — fares will be higher"))
    elif any(p >= 2 for p in precip_forecast[:6]):
        alerts.append(ForecastAlert(type="rain", text="Light rain possible — minor fare increase expected"))
 
    arrive_hour = body.arrive_by_hour
    is_peak_arrival = arrive_hour in {7, 8, 9, 10, 17, 18, 19, 20} and day_of_week < 5
    if is_peak_arrival:
        alerts.append(ForecastAlert(type="traffic", text=f"Peak traffic expected around {_fmt_time(arrive_hour, 0)} — leave earlier for safety"))
 
    if d_info_best.driver_supply <= 3:
        alerts.append(ForecastAlert(type="availability", text="Low driver supply predicted — auto/bike may be hard to get"))
 
    if best_slot.surge_multiplier >= 1.25:
        alerts.append(ForecastAlert(type="surge", text=f"Surge {best_slot.surge_multiplier}x active at recommended time — metro is surge-free"))
 
    # ── 10. Confidence ────────────────────────────────────────
    confidence = _confidence(d_info_best.cancel_rate, precip_best, d_info_best.demand_score)
 
    return PlanTripResponse(
        best=best_slot,
        alternatives=alternatives,
        confidence=confidence,
        alerts=alerts,
        metro_tip=metro_tip,
    )

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
    wx_impact = weather.get_weather_impact(body.origin_lat, body.origin_lon)
    is_raining = body.override_rain if body.override_rain is not None else wx_impact["is_raining"]
    risk_multiplier = wx_impact["risk_multiplier"] if body.override_rain is None else (1.30 if body.override_rain else 1.0)

    demand_info = demand.get_demand_for_location(
        session, body.origin_lat, body.origin_lon, body.hour, body.day_of_week
    )

    area = _nearest_area(session, body.origin_lat, body.origin_lon)

    # Apply road-distance correction factor (Haversine × 1.4 for Hyderabad road geometry)
    distance_km = _haversine_km(
        body.origin_lat, body.origin_lon, body.dest_lat, body.dest_lon
    ) * _ROAD_FACTOR

    is_peak_hour = _is_peak(body.hour, body.day_of_week)
    is_weekend = 1 if body.day_of_week >= 5 else 0

    features = RideFeatures(
        hour=body.hour,
        day_of_week=body.day_of_week,
        month=body.month,
        is_peak_hour=int(is_peak_hour),
        is_weekend=is_weekend,
        distance_km=distance_km,
        historical_cancel_rate=demand_info.cancel_rate,
        metro_count_1km=area.metro_count_1km if area else 0,
        bus_stop_count_1km=area.bus_stop_count_1km if area else 0,
        traffic_chokepoint_nearby=int(area.traffic_chokepoint_nearby) if area else 0,
        is_flood_prone=int(area.is_flood_prone) if area else 0,
    )

    if body.user_id is not None and not session.get(User, body.user_id):
        raise HTTPException(status_code=422, detail=f"user_id {body.user_id} does not exist")

    # Get ML probability, then blend with rule-based + weather multiplier for final result
    ml_result = predict_cancellation_risk(features)
    result = hybrid_predict(
        ml_prob=ml_result["cancel_probability"],
        base_cancel_rate=demand_info.cancel_rate,
        hour=body.hour,
        day_of_week=body.day_of_week,
        is_peak_hour=is_peak_hour,
        risk_multiplier=risk_multiplier,
    )

    session.add(RidePrediction(
        origin_lat=body.origin_lat,
        origin_lon=body.origin_lon,
        dest_lat=body.dest_lat,
        dest_lon=body.dest_lon,
        predicted_risk=result["risk_level"],
        probability=result["cancel_probability"],
        is_raining=is_raining,
        user_id=body.user_id,
    ))
    session.commit()

    return PredictResponse(
        risk_level=result["risk_level"],
        probability=result["cancel_probability"],
        is_raining=is_raining,
        weather_conditions=wx_impact["weather_condition"],
        cancel_rate=demand_info.cancel_rate,
        demand_score=demand_info.demand_score,
        driver_supply=demand_info.driver_supply,
        factors=_build_factors(features, is_raining, demand_info),
        using_ml_model=True,
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

    best = min(slots, key=lambda s: s.cancel_risk) if slots else None

    return BestTimeResponse(slots=slots, best_slot=best)
