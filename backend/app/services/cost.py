"""
Cost calculation service — Hyderabad pricing formulas for all transport modes.
Fare rules verified from real Uber Hyderabad observations (May 2025).

Rates back-calculated from live Uber app prices at off-peak hours (no surge).
Two routes cross-validated:
  - Tolichowki → MJCET:        Routes API 7.2km → Uber 9.4km (×1.31 auto/bike)
  - Aditya Nagar → Attapur:    Routes API ~6.9km → Uber 9.0km (×1.31 auto/bike)

Distance correction:
  Auto/bike: Uber routes via narrower roads not in Google routing. ×1.31 applied.
  Cabs: Google Routes API distance used as-is. No correction needed.

Surge pricing — additive model, capped at 1.5x:
  base        = 1.0
  heavy peak  = +0.30  (8–10am, 18–20 weekdays)
  moderate pk = +0.15  (10–11am, 17–18, 20–21 weekdays)
  mild rain   = +0.10  (2–8mm/hr)
  heavy rain  = +0.20  (≥8mm/hr)
  festival    = +0.10  (optional frontend flag)
  night auto  = +0.20  (23–05)
  night cab   = +0.10  (23–05)
  night bike  = +0.05  (23–05)
  final = min(1.0 + additions, 1.5)
  bike additionally capped at 1.1x

Modes and passenger eligibility:
  bike  — passengers == 1 only
  auto  — passengers 1–3
  cab   — all passenger counts (mini/sedan/suv variants)
  metro — all passenger counts, no surge
  bus   — all passenger counts, no surge
"""

from dataclasses import dataclass
from math import atan2, cos, radians, sin, sqrt


@dataclass
class CostResult:
    mode: str
    variant: str | None
    base_cost_inr: float
    surge_multiplier: float
    final_cost_inr: float
    cost_min_inr: float
    cost_max_inr: float
    cost_display: str
    time_min: int
    available: bool
    vehicles_needed: int = 1


# ── Haversine (kept for fallback) ─────────────────────────────
def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


# ── Distance correction ───────────────────────────────────────
_AUTO_BIKE_DISTANCE_FACTOR = 1.12

# ── Helpers ───────────────────────────────────────────────────
def _is_night(hour: int) -> bool:
    return hour >= 23 or hour < 5


def _get_surge(
    mode: str,
    hour: int,
    day_of_week: int,
    precipitation_mm: float,
    is_festival: bool,
) -> float:
    if mode in ("metro", "bus"):
        return 1.0

    additions = 0.0
    is_weekday = day_of_week < 5

    # Heavy peak only
    if is_weekday:
        if 7 <= hour < 10 or 18 <= hour < 21:
            additions += 0.15

        # Mild shoulder traffic
        elif 10 <= hour < 11 or 17 <= hour < 18:
            additions += 0.08

    # Rain
    if 2 <= precipitation_mm < 8:
        additions += 0.10
    elif precipitation_mm >= 8:
        additions += 0.20

    # Festival
    if is_festival:
        additions += 0.10

    # Night pricing
    if _is_night(hour):
        if mode == "auto":
            additions += 0.20
        elif mode == "bike":
            additions += 0.05
        else:
            additions += 0.10

    # General cap
    surge = min(1.0 + additions, 1.35)

    # Bike should stay cheap
    if mode == "bike":
        surge = min(surge, 1.10)

    return round(surge, 2)


def _make_range(mid: float, surge: float, mode: str) -> tuple[float, float, str]:
    final = mid * surge

    if mode == "bike":
        spread = 8
    elif mode == "auto":
        spread = 20
    elif mode == "cab":
        spread = 30
    else:
        spread = 10

    lo = round(final - spread)
    hi = round(final + spread)

    return float(lo), float(hi), f"₹{lo}–₹{hi}"


# ── Fare base formulas (verified Uber Hyderabad May 2025) ─────
def _auto_base(d: float) -> float:
    return 68.0 if d <= 1.5 else 68.0 + (d - 1.5) * 7.8

def _bike_base(d: float) -> float:
    if d <= 1.5: return 30.0
    if d <= 1.9: return 43.0
    return 43.0 + (d - 1.9) * 6.4

def _mini_base(d: float) -> float:
    return 124.0 if d <= 4.0 else 124.0 + (d - 4.0) * 30.2

def _sedan_base(d: float) -> float:
    return 243.0 if d <= 3.3 else 243.0 + (d - 3.3) * 13.4

def _suv_base(d: float) -> float:
    if d <= 1.5: return 217.0
    if d <= 4.0: return 290.0
    return 290.0 + (d - 4.0) * 19.0

def _metro_fare(d: float) -> float:
    for limit, fare in [(2,10),(5,15),(8,20),(12,25),(18,30),(26,35),(float("inf"),40)]:
        if d <= limit: return float(fare)
    return 40.0

def _bus_fare(d: float) -> float:
    for limit, fare in [(5,10),(10,15),(20,20),(30,25),(float("inf"),30)]:
        if d <= limit: return float(fare)
    return 30.0


# ── Travel time ───────────────────────────────────────────────
def travel_only_min(mode: str, distance_km: float, hour: int) -> int:
    is_peak = hour in {7, 8, 9, 10, 17, 18, 19, 20}
    if mode in {"cab_mini", "cab_sedan", "cab_suv"}:
        return max(5, round(distance_km / (25.0 if is_peak else 35.0) * 60))
    if mode == "auto":
        return max(5, round(distance_km / (20.0 if is_peak else 28.0) * 60))
    if mode == "bike":
        return max(3, round(distance_km / (22.0 if is_peak else 30.0) * 60))
    if mode == "metro":
        return max(8, round(distance_km / 40.0 * 60))
    if mode == "bus":
        return max(8, round(distance_km / 15.0 * 60))
    return 20

def _travel_time_min(mode: str, distance_km: float, hour: int) -> int:
    return travel_only_min(mode, distance_km, hour)

def bus_wait_min(hour: int, day_of_week: int) -> int:
    is_peak = hour in {7, 8, 9, 17, 18, 19, 20} and day_of_week < 5
    if is_peak: return 15
    if hour >= 22 or hour <= 5: return 45
    return 30


# ── Per-mode cost builders ────────────────────────────────────

def _bike_cost(distance_km, hour, day_of_week, passengers, precipitation_mm=0.0, is_festival=False):
    d = distance_km * _AUTO_BIKE_DISTANCE_FACTOR
    mid = _bike_base(d)
    surge = _get_surge("bike", hour, day_of_week, precipitation_mm, is_festival)
    lo, hi, display = _make_range(mid, surge, "bike")
    return CostResult(
        mode="bike", variant=None,
        base_cost_inr=round(mid, 2), surge_multiplier=surge,
        final_cost_inr=round(mid * surge, 2),
        cost_min_inr=lo, cost_max_inr=hi, cost_display=display,
        time_min=_travel_time_min("bike", d, hour),
        available=passengers == 1,
    )


def _auto_cost(distance_km, hour, day_of_week, passengers, precipitation_mm=0.0, is_festival=False):
    d = distance_km * _AUTO_BIKE_DISTANCE_FACTOR
    mid = _auto_base(d)
    surge = _get_surge("auto", hour, day_of_week, precipitation_mm, is_festival)
    lo, hi, display = _make_range(mid, surge, "auto")
    return CostResult(
        mode="auto", variant=None,
        base_cost_inr=round(mid, 2), surge_multiplier=surge,
        final_cost_inr=round(mid * surge, 2),
        cost_min_inr=lo, cost_max_inr=hi, cost_display=display,
        time_min=_travel_time_min("auto", d, hour),
        available=passengers <= 3,
    )


def _cab_mini_cost(distance_km, hour, day_of_week, passengers, precipitation_mm=0.0, is_festival=False):
    CAP = 4
    vehicles = -(-passengers // CAP)
    mid = _mini_base(distance_km) * vehicles
    surge = _get_surge("cab_mini", hour, day_of_week, precipitation_mm, is_festival)
    lo, hi, display = _make_range(mid, surge, "cab")
    return CostResult(
        mode="cab", variant="mini",
        base_cost_inr=round(mid, 2), surge_multiplier=surge,
        final_cost_inr=round(mid * surge, 2),
        cost_min_inr=lo, cost_max_inr=hi, cost_display=display,
        time_min=_travel_time_min("cab_mini", distance_km, hour),
        available=True, vehicles_needed=vehicles,
    )


def _cab_sedan_cost(distance_km, hour, day_of_week, passengers, precipitation_mm=0.0, is_festival=False):
    CAP = 4
    vehicles = -(-passengers // CAP)
    mid = _sedan_base(distance_km) * vehicles
    surge = _get_surge("cab_sedan", hour, day_of_week, precipitation_mm, is_festival)
    lo, hi, display = _make_range(mid, surge, "cab")
    return CostResult(
        mode="cab", variant="sedan",
        base_cost_inr=round(mid, 2), surge_multiplier=surge,
        final_cost_inr=round(mid * surge, 2),
        cost_min_inr=lo, cost_max_inr=hi, cost_display=display,
        time_min=_travel_time_min("cab_sedan", distance_km, hour),
        available=True, vehicles_needed=vehicles,
    )


def _cab_suv_cost(distance_km, hour, day_of_week, passengers, precipitation_mm=0.0, is_festival=False):
    CAP = 7
    vehicles = -(-passengers // CAP)
    mid = _suv_base(distance_km) * vehicles
    surge = _get_surge("cab_suv", hour, day_of_week, precipitation_mm, is_festival)
    lo, hi, display = _make_range(mid, surge, "cab")
    return CostResult(
        mode="cab", variant="suv",
        base_cost_inr=round(mid, 2), surge_multiplier=surge,
        final_cost_inr=round(mid * surge, 2),
        cost_min_inr=lo, cost_max_inr=hi, cost_display=display,
        time_min=_travel_time_min("cab_suv", distance_km, hour),
        available=True, vehicles_needed=vehicles,
    )


def _metro_cost(distance_km, hour):
    fare = _metro_fare(distance_km)
    return CostResult(
        mode="metro", variant=None,
        base_cost_inr=fare, surge_multiplier=1.0, final_cost_inr=fare,
        cost_min_inr=fare, cost_max_inr=fare, cost_display=f"₹{int(fare)}",
        time_min=_travel_time_min("metro", distance_km, hour),
        available=True,
    )


def _bus_cost(distance_km, hour, day_of_week):
    fare = _bus_fare(distance_km)
    wait = bus_wait_min(hour, day_of_week)
    travel = max(12, round(distance_km / 15.0 * 60) + wait)
    return CostResult(
        mode="bus", variant=None,
        base_cost_inr=fare, surge_multiplier=1.0, final_cost_inr=fare,
        cost_min_inr=fare, cost_max_inr=fare, cost_display=f"₹{int(fare)}",
        time_min=travel, available=True,
    )


# ── Public API ────────────────────────────────────────────────

def calculate_all_costs(
    distance_km: float,
    hour: int,
    is_raining: bool,           # kept for backward compat — not used internally
    day_of_week: int,
    passengers: int = 1,
    cancel_rate: float = 0.5,   # kept for backward compat — not used internally
    precipitation_mm: float = 0.0,
    is_festival: bool = False,
) -> list[CostResult]:
    """
    Return cost breakdown for all modes.
    distance_km: real road distance from Google Routes API.
                 Auto/bike correction ×1.31 applied internally.
    precipitation_mm: current hour rainfall from Open-Meteo.
    is_festival: optional frontend flag for festival surge.
    """
    return [
        _bike_cost(distance_km, hour, day_of_week, passengers, precipitation_mm, is_festival),
        _auto_cost(distance_km, hour, day_of_week, passengers, precipitation_mm, is_festival),
        _cab_mini_cost(distance_km, hour, day_of_week, passengers, precipitation_mm, is_festival),
        _cab_sedan_cost(distance_km, hour, day_of_week, passengers, precipitation_mm, is_festival),
        _cab_suv_cost(distance_km, hour, day_of_week, passengers, precipitation_mm, is_festival),
        _metro_cost(distance_km, hour),
        _bus_cost(distance_km, hour, day_of_week),
    ]


def calculate_available_costs(
    distance_km: float,
    hour: int,
    is_raining: bool,
    day_of_week: int,
    passengers: int = 1,
    cancel_rate: float = 0.5,
    precipitation_mm: float = 0.0,
    is_festival: bool = False,
) -> list[CostResult]:
    return [
        c for c in calculate_all_costs(
            distance_km, hour, is_raining, day_of_week,
            passengers, cancel_rate, precipitation_mm, is_festival,
        )
        if c.available
    ]