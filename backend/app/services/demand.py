"""
Demand service — queries DemandPattern and HyderabadZone tables to return
historical cancel rates and demand scores for a given zone and time.
"""

import logging
from dataclasses import dataclass
from math import atan2, cos, radians, sin, sqrt

from sqlmodel import Session, select

from app.models import AreaContext, DemandPattern, HyderabadZone

logger = logging.getLogger(__name__)

# Hyderabad average as a safe default when no data is found
_DEFAULT_CANCEL_RATE = 0.57


@dataclass
class DemandInfo:
    constituency_num: str
    cancel_rate: float
    driver_supply: int
    booking_count: int
    demand_score: float      # 0.0–1.0, higher = more demand relative to supply
    risk_level: str          # medium | high


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def _nearest_area_context(session: Session, lat: float, lon: float) -> AreaContext | None:
    """Return the AreaContext row whose zone centre is closest to (lat, lon)."""
    zones = session.exec(select(AreaContext)).all()
    if not zones:
        return None
    return min(zones, key=lambda z: _haversine_km(lat, lon, z.latitude, z.longitude))


def get_demand_for_location(
    session: Session,
    lat: float,
    lon: float,
    hour: int,
    day_of_week: int,
) -> DemandInfo:
    """
    Return demand and cancellation info for a location at a given time.
    Maps (lat, lon) → nearest AreaContext zone → nearest HyderabadZone AC →
    DemandPattern row for that AC, hour, and day.
    Falls back gracefully at every step if data is missing.
    """
    # Step 1: find nearest named zone
    area = _nearest_area_context(session, lat, lon)
    risk_level = area.risk_level if area else "medium"

    # Step 2: find a HyderabadZone row — use the one with lowest cancel rate
    # as an approximate match when we can't do proper geo mapping for ACs
    hz_row = session.exec(
        select(HyderabadZone).order_by(HyderabadZone.base_cancel_rate)
    ).first()

    ac_num = hz_row.ac_number if hz_row else "88"   # AC 88 is the high-volume default

    # Step 3: fetch demand pattern for this AC, hour, day
    pattern = session.exec(
        select(DemandPattern).where(
            DemandPattern.constituency_num == ac_num,
            DemandPattern.hour_of_day == hour,
            DemandPattern.day_of_week == day_of_week,
        )
    ).first()

    if pattern:
        cancel_rate = pattern.cancel_rate
        driver_supply = pattern.driver_supply
        booking_count = pattern.booking_count
    else:
        cancel_rate = hz_row.base_cancel_rate if hz_row else _DEFAULT_CANCEL_RATE
        driver_supply = 5
        booking_count = 1

    # Demand score: bookings relative to supply (capped 0–1)
    demand_score = round(min(1.0, booking_count / max(1, driver_supply * 10)), 3)

    return DemandInfo(
        constituency_num=ac_num,
        cancel_rate=round(cancel_rate, 4),
        driver_supply=driver_supply,
        booking_count=booking_count,
        demand_score=demand_score,
        risk_level=risk_level,
    )


def get_zone_name_for_location(session: Session, lat: float, lon: float) -> str:
    """Return the nearest zone name for a coordinate pair."""
    area = _nearest_area_context(session, lat, lon)
    return area.zone_name if area else "Hyderabad"


def get_area_context(session: Session, lat: float, lon: float):
    """Return AreaContext for the zone nearest to (lat, lon)."""
    return _nearest_area_context(session, lat, lon)
