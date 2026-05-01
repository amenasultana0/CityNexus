"""
Cost calculation service — Hyderabad pricing formulas for all transport modes.
Surge pricing based on MVAG 2025 guidelines for app-based bookings.
All formulas are deterministic, no DB or external calls needed.

Modes and passenger eligibility:
  bike    — passengers == 1 only
  auto    — passengers 1–2  (app-based, light surge applies)
  cab     — all passenger counts (mini and sedan variants)
  metro   — all passenger counts, no surge
  bus     — all passenger counts, no surge
"""

from dataclasses import dataclass
from math import atan2, cos, radians, sin, sqrt


@dataclass
class CostResult:
    mode: str
    variant: str | None       # "mini" / "sedan" for cab, None for others
    base_cost_inr: float
    surge_multiplier: float
    final_cost_inr: float
    time_min: int
    available: bool           # False when passenger count disqualifies the mode
    vehicles_needed: int = 1  # >1 when passengers exceed single-vehicle capacity


# ── Haversine ────────────────────────────────────────────────
def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


# ── Surge calculators ─────────────────────────────────────────

def _is_peak(hour: int, day_of_week: int) -> bool:
    """Weekday peak: 8–10 am and 6–9 pm (Mon–Fri)."""
    return hour in {8, 9, 18, 19, 20} and day_of_week < 5


def _is_weekend_night(hour: int, day_of_week: int) -> bool:
    """Fri/Sat late night: 10 pm–2 am."""
    return day_of_week in {4, 5} and hour in {22, 23, 0, 1}


def cab_surge(hour: int, is_raining: bool, day_of_week: int) -> float:
    """
    MVAG 2025 — cab surge:
      Rain:          2.0x  (overrides all)
      Peak weekday:  2.0x
      Weekend night: 1.3x
    """
    if is_raining:
        return 2.0
    if _is_peak(hour, day_of_week):
        return 2.0
    if _is_weekend_night(hour, day_of_week):
        return 1.3
    return 1.0


def auto_surge(hour: int, is_raining: bool, day_of_week: int) -> float:
    """
    MVAG 2025 — app-based auto surge (lighter than cab):
      Rain:          1.5x
      Peak weekday:  1.3x
    No weekend night surge for auto.
    """
    if is_raining:
        return 1.5
    if _is_peak(hour, day_of_week):
        return 1.3
    return 1.0


def bike_surge(hour: int, is_raining: bool, day_of_week: int) -> float:
    """
    MVAG 2025 — bike taxi surge:
      Rain:          1.8x
      Peak weekday:  1.5x
    """
    if is_raining:
        return 1.8
    if _is_peak(hour, day_of_week):
        return 1.5
    return 1.0


# ── Road factor — straight-line to actual road distance ───────
ROAD_FACTOR = 1.4


# ── Travel time (Haversine + speed assumptions) ───────────────
def _travel_time_min(mode: str, distance_km: float, hour: int) -> int:
    """Internal: travel time used by cost builders for commute planning."""
    is_peak = hour in {7, 8, 9, 17, 18, 19, 20}
    road_km = distance_km * ROAD_FACTOR
    if mode in {"cab_mini", "cab_sedan"}:
        speed = 25.0 if is_peak else 35.0
        return max(5, round(road_km / speed * 60))
    if mode == "auto":
        speed = 20.0 if is_peak else 28.0
        return max(5, round(road_km / speed * 60))
    if mode == "bike":
        speed = 22.0 if is_peak else 30.0
        return max(3, round(road_km / speed * 60))
    if mode == "metro":
        return max(10, round(distance_km / 40.0 * 60) + 8)  # metro: track distance, no road factor
    if mode == "bus":
        return max(12, round(road_km / 15.0 * 60) + 10)
    return 30


def travel_only_min(mode: str, distance_km: float, hour: int) -> int:
    """
    Pure road travel time — no wait, no walk. Applies ROAD_FACTOR for road
    modes; metro uses track distance (no road factor).
    mode values: cab_mini | cab_sedan | cab_suv | auto | bike | metro | bus
    """
    is_peak = hour in {7, 8, 9, 17, 18, 19, 20}
    road_km = distance_km * ROAD_FACTOR
    if mode in {"cab_mini", "cab_sedan", "cab_suv"}:
        speed = 25.0 if is_peak else 35.0
        return max(5, round(road_km / speed * 60))
    if mode == "auto":
        speed = 20.0 if is_peak else 28.0
        return max(5, round(road_km / speed * 60))
    if mode == "bike":
        speed = 22.0 if is_peak else 30.0
        return max(3, round(road_km / speed * 60))
    if mode == "metro":
        return max(8, round(distance_km / 40.0 * 60))  # no road factor
    if mode == "bus":
        return max(8, round(road_km / 15.0 * 60))
    return 20


# ── Per-mode cost builders ────────────────────────────────────

def _cab_mini_cost(
    distance_km: float, hour: int, is_raining: bool, day_of_week: int, passengers: int = 1
) -> CostResult:
    """Ola Mini / Uber Go — ₹80 for first 4 km, ₹15/km after. Max 4 passengers per vehicle."""
    CAP = 4
    vehicles = -(-passengers // CAP)  # ceiling division
    base = (80.0 + max(0.0, distance_km - 4.0) * 15.0) * vehicles
    surge = cab_surge(hour, is_raining, day_of_week)
    return CostResult(
        mode="cab", variant="mini",
        base_cost_inr=round(base, 2),
        surge_multiplier=surge,
        final_cost_inr=round(base * surge, 2),
        time_min=_travel_time_min("cab_mini", distance_km, hour),
        available=True,
        vehicles_needed=vehicles,
    )


def _cab_sedan_cost(
    distance_km: float, hour: int, is_raining: bool, day_of_week: int, passengers: int = 1
) -> CostResult:
    """Ola Prime / Uber Premier — ₹100 for first 5 km, ₹18/km after. Max 4 passengers per vehicle."""
    CAP = 4
    vehicles = -(-passengers // CAP)  # ceiling division
    base = (100.0 + max(0.0, distance_km - 5.0) * 18.0) * vehicles
    surge = cab_surge(hour, is_raining, day_of_week)
    return CostResult(
        mode="cab", variant="sedan",
        base_cost_inr=round(base, 2),
        surge_multiplier=surge,
        final_cost_inr=round(base * surge, 2),
        time_min=_travel_time_min("cab_sedan", distance_km, hour),
        available=True,
        vehicles_needed=vehicles,
    )


def _auto_cost(
    distance_km: float, hour: int, is_raining: bool, day_of_week: int, passengers: int
) -> CostResult:
    """App-based auto — ₹29 base + ₹13/km after first km. Light surge (MVAG 2025). Max 3 passengers."""
    base = 29.0 + max(0.0, distance_km - 1.0) * 13.0
    surge = auto_surge(hour, is_raining, day_of_week)
    return CostResult(
        mode="auto", variant=None,
        base_cost_inr=round(base, 2),
        surge_multiplier=surge,
        final_cost_inr=round(base * surge, 2),
        time_min=_travel_time_min("auto", distance_km, hour),
        available=passengers <= 3,
    )


def _bike_cost(
    distance_km: float, hour: int, is_raining: bool, day_of_week: int, passengers: int
) -> CostResult:
    """Bike/Scooty taxi — ₹40 for first 3 km, ₹8/km after. Solo only."""
    base = 40.0 + max(0.0, distance_km - 3.0) * 8.0
    surge = bike_surge(hour, is_raining, day_of_week)
    return CostResult(
        mode="bike", variant=None,
        base_cost_inr=round(base, 2),
        surge_multiplier=surge,
        final_cost_inr=round(base * surge, 2),
        time_min=_travel_time_min("bike", distance_km, hour),
        available=passengers == 1,
    )


def _cab_suv_cost(
    distance_km: float, hour: int, is_raining: bool, day_of_week: int, passengers: int = 1
) -> CostResult:
    """Ola SUV / Uber XL — ₹130 for first 5 km, ₹22/km after. Max 7 passengers per vehicle."""
    CAP = 7
    vehicles = -(-passengers // CAP)  # ceiling division
    base = (130.0 + max(0.0, distance_km - 5.0) * 22.0) * vehicles
    surge = cab_surge(hour, is_raining, day_of_week)
    return CostResult(
        mode="cab", variant="suv",
        base_cost_inr=round(base, 2),
        surge_multiplier=surge,
        final_cost_inr=round(base * surge, 2),
        time_min=_travel_time_min("cab_sedan", distance_km, hour),
        available=True,
        vehicles_needed=vehicles,
    )


def _metro_cost(distance_km: float, hour: int) -> CostResult:
    """HMRL fare — ≤2→₹10, ≤4→₹15, ≤8→₹20, ≤16→₹30, >16→₹60. No surge."""
    if distance_km <= 2:
        fare = 10.0
    elif distance_km <= 4:
        fare = 15.0
    elif distance_km <= 8:
        fare = 20.0
    elif distance_km <= 16:
        fare = 30.0
    else:
        fare = 60.0
    return CostResult(
        mode="metro", variant=None,
        base_cost_inr=fare,
        surge_multiplier=1.0,
        final_cost_inr=fare,
        time_min=_travel_time_min("metro", distance_km, hour),
        available=True,
    )


def bus_wait_min(hour: int, day_of_week: int) -> int:
    """
    Realistic TSRTC bus wait time based on service frequency.
    Peak weekday: ~15 min. Off-peak: ~30 min. Night/weekend night: ~45 min.
    """
    is_peak = hour in {7, 8, 9, 17, 18, 19, 20} and day_of_week < 5
    if is_peak:
        return 15
    if hour >= 22 or hour <= 5:
        return 45
    return 30


def _bus_cost(distance_km: float, hour: int, day_of_week: int) -> CostResult:
    """TSRTC bus — ≤5km→₹10, ≤10km→₹20, >10km→₹30. No surge. Wait time varies by hour."""
    if distance_km <= 5:
        fare = 10.0
    elif distance_km <= 10:
        fare = 20.0
    else:
        fare = 30.0
    wait = bus_wait_min(hour, day_of_week)
    travel = max(12, round(distance_km / 15.0 * 60) + wait)
    return CostResult(
        mode="bus", variant=None,
        base_cost_inr=fare,
        surge_multiplier=1.0,
        final_cost_inr=fare,
        time_min=travel,
        available=True,
    )


# ── Public API ────────────────────────────────────────────────

def calculate_all_costs(
    distance_km: float,
    hour: int,
    is_raining: bool,
    day_of_week: int,
    passengers: int = 1,
) -> list[CostResult]:
    """
    Return cost breakdown for all modes including unavailable ones.
    Caller can use available=False to show 'not available for X passengers'.
    """
    return [
        _bike_cost(distance_km, hour, is_raining, day_of_week, passengers),
        _auto_cost(distance_km, hour, is_raining, day_of_week, passengers),
        _cab_mini_cost(distance_km, hour, is_raining, day_of_week, passengers),
        _cab_sedan_cost(distance_km, hour, is_raining, day_of_week, passengers),
        _cab_suv_cost(distance_km, hour, is_raining, day_of_week, passengers),
        _metro_cost(distance_km, hour),
        _bus_cost(distance_km, hour, day_of_week),
    ]


def calculate_available_costs(
    distance_km: float,
    hour: int,
    is_raining: bool,
    day_of_week: int,
    passengers: int = 1,
) -> list[CostResult]:
    """Return only modes available for the given passenger count."""
    return [
        c for c in calculate_all_costs(distance_km, hour, is_raining, day_of_week, passengers)
        if c.available
    ]
