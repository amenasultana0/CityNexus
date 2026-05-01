"""
Cost calculation service — Hyderabad pricing formulas for all transport modes.
Surge pricing based on real Hyderabad 2024-2025 market rates.
All formulas are deterministic, no DB or external calls needed.

Modes and passenger eligibility:
  bike    — passengers == 1 only
  auto    — passengers 1–3  (app-based, light surge applies)
  cab     — all passenger counts (mini, sedan, suv variants)
  metro   — all passenger counts, no surge
  bus     — all passenger counts, no surge
"""

from dataclasses import dataclass
from math import atan2, cos, radians, sin, sqrt


@dataclass
class CostResult:
    mode: str
    variant: str | None       # "mini" / "sedan" / "suv" for cab, None for others
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


# ── Pricing constants — Hyderabad 2024-2025 rates ─────────────
PRICING = {
    "bike": {
        "base_fare": 15,      # ₹15 base
        "per_km": 8,          # ₹8 per km
        "min_fare": 25,       # minimum ₹25
    },
    "auto": {
        "base_fare": 25,      # ₹25 base
        "per_km": 12,         # ₹12 per km
        "min_fare": 40,       # minimum ₹40
    },
    "cab_mini": {
        "base_fare": 30,      # ₹30 base
        "per_km": 14,         # ₹14 per km
        "min_fare": 60,       # minimum ₹60
    },
    "cab_sedan": {
        "base_fare": 40,      # ₹40 base
        "per_km": 16,         # ₹16 per km
        "min_fare": 80,       # minimum ₹80
    },
    "cab_suv": {
        "base_fare": 50,      # ₹50 base
        "per_km": 20,         # ₹20 per km
        "min_fare": 100,      # minimum ₹100
    },
    "metro": {
        "base_fare": 10,      # ₹10 minimum
        "per_km": 2,          # ₹2 per km (HMRL slab rate)
        "min_fare": 10,
        "max_fare": 60,       # HMRL max fare ₹60
    },
    "bus": {
        "flat_fare": 15,      # TSRTC flat fare ₹15 city routes
        "min_fare": 10,
        "max_fare": 25,
    },
}


# ── Surge multiplier ──────────────────────────────────────────

def get_surge_multiplier(mode: str, hour: int, day_of_week: int, cancel_rate: float) -> float:
    """Realistic surge based on cancel rate, peak hours, and day."""
    # No surge for fixed-fare modes
    if mode in ["metro", "bus"]:
        return 1.0

    # Base surge from historical cancel rate
    if cancel_rate >= 0.70:
        base_surge = 1.4
    elif cancel_rate >= 0.60:
        base_surge = 1.2
    else:
        base_surge = 1.0

    # Peak hour adjustment
    if hour in [8, 9, 18, 19, 20]:
        base_surge *= 1.1

    # Friday evening
    if day_of_week == 4 and hour in [17, 18, 19, 20]:
        base_surge *= 1.1

    return min(round(base_surge, 1), 1.8)


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
        return max(10, round(distance_km / 40.0 * 60) + 8)
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
        return max(8, round(distance_km / 40.0 * 60))
    if mode == "bus":
        return max(8, round(road_km / 15.0 * 60))
    return 20


# ── Per-mode cost builders ────────────────────────────────────

def _bike_cost(
    distance_km: float, hour: int, day_of_week: int, passengers: int,
    cancel_rate: float = 0.5,
) -> CostResult:
    """Bike/Scooty taxi — ₹15 base + ₹8/km, min ₹25. Solo only."""
    p = PRICING["bike"]
    base = max(p["min_fare"], p["base_fare"] + distance_km * p["per_km"])
    surge = get_surge_multiplier("bike", hour, day_of_week, cancel_rate)
    return CostResult(
        mode="bike", variant=None,
        base_cost_inr=round(base, 2),
        surge_multiplier=surge,
        final_cost_inr=round(base * surge, 2),
        time_min=_travel_time_min("bike", distance_km, hour),
        available=passengers == 1,
    )


def _auto_cost(
    distance_km: float, hour: int, day_of_week: int, passengers: int,
    cancel_rate: float = 0.5,
) -> CostResult:
    """App-based auto — ₹25 base + ₹12/km, min ₹40. Max 3 passengers."""
    p = PRICING["auto"]
    base = max(p["min_fare"], p["base_fare"] + distance_km * p["per_km"])
    surge = get_surge_multiplier("auto", hour, day_of_week, cancel_rate)
    return CostResult(
        mode="auto", variant=None,
        base_cost_inr=round(base, 2),
        surge_multiplier=surge,
        final_cost_inr=round(base * surge, 2),
        time_min=_travel_time_min("auto", distance_km, hour),
        available=passengers <= 3,
    )


def _cab_mini_cost(
    distance_km: float, hour: int, day_of_week: int, passengers: int,
    cancel_rate: float = 0.5,
) -> CostResult:
    """Ola Mini / Uber Go — ₹30 base + ₹14/km, min ₹60. Max 4 passengers per vehicle."""
    CAP = 4
    vehicles = -(-passengers // CAP)
    p = PRICING["cab_mini"]
    base = max(p["min_fare"], p["base_fare"] + distance_km * p["per_km"]) * vehicles
    surge = get_surge_multiplier("cab_mini", hour, day_of_week, cancel_rate)
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
    distance_km: float, hour: int, day_of_week: int, passengers: int,
    cancel_rate: float = 0.5,
) -> CostResult:
    """Ola Prime / Uber Premier — ₹40 base + ₹16/km, min ₹80. Max 4 passengers per vehicle."""
    CAP = 4
    vehicles = -(-passengers // CAP)
    p = PRICING["cab_sedan"]
    base = max(p["min_fare"], p["base_fare"] + distance_km * p["per_km"]) * vehicles
    surge = get_surge_multiplier("cab_sedan", hour, day_of_week, cancel_rate)
    return CostResult(
        mode="cab", variant="sedan",
        base_cost_inr=round(base, 2),
        surge_multiplier=surge,
        final_cost_inr=round(base * surge, 2),
        time_min=_travel_time_min("cab_sedan", distance_km, hour),
        available=True,
        vehicles_needed=vehicles,
    )


def _cab_suv_cost(
    distance_km: float, hour: int, day_of_week: int, passengers: int,
    cancel_rate: float = 0.5,
) -> CostResult:
    """Ola SUV / Uber XL — ₹50 base + ₹20/km, min ₹100. Max 7 passengers per vehicle."""
    CAP = 7
    vehicles = -(-passengers // CAP)
    p = PRICING["cab_suv"]
    base = max(p["min_fare"], p["base_fare"] + distance_km * p["per_km"]) * vehicles
    surge = get_surge_multiplier("cab_suv", hour, day_of_week, cancel_rate)
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
    """HMRL fare — ₹10 base + ₹2/km, capped at ₹60. No surge."""
    p = PRICING["metro"]
    fare = max(p["min_fare"], min(p["max_fare"], p["base_fare"] + distance_km * p["per_km"]))
    return CostResult(
        mode="metro", variant=None,
        base_cost_inr=round(fare, 2),
        surge_multiplier=1.0,
        final_cost_inr=round(fare, 2),
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
    """TSRTC bus — ₹15 flat fare, min ₹10, max ₹25. No surge. Wait time varies."""
    p = PRICING["bus"]
    fare = min(p["max_fare"], max(p["min_fare"], p["flat_fare"]))
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
    cancel_rate: float = 0.5,
) -> list[CostResult]:
    """
    Return cost breakdown for all modes including unavailable ones.
    Caller can use available=False to show 'not available for X passengers'.
    """
    return [
        _bike_cost(distance_km, hour, day_of_week, passengers, cancel_rate),
        _auto_cost(distance_km, hour, day_of_week, passengers, cancel_rate),
        _cab_mini_cost(distance_km, hour, day_of_week, passengers, cancel_rate),
        _cab_sedan_cost(distance_km, hour, day_of_week, passengers, cancel_rate),
        _cab_suv_cost(distance_km, hour, day_of_week, passengers, cancel_rate),
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
) -> list[CostResult]:
    """Return only modes available for the given passenger count."""
    return [
        c for c in calculate_all_costs(distance_km, hour, is_raining, day_of_week, passengers, cancel_rate)
        if c.available
    ]
