"""
Transport service — nearest-stop finder using Haversine distance.
Queries TransportStop table with a bounding-box pre-filter for speed,
then ranks by exact Haversine distance.
"""

from math import atan2, cos, radians, sin, sqrt
from dataclasses import dataclass

from sqlmodel import Session, select

from app.models import TransportStop

# 1° latitude ≈ 111 km
_KM_PER_DEG_LAT = 111.0


@dataclass
class NearbyStop:
    name: str
    stop_type: str
    latitude: float
    longitude: float
    distance_m: int
    walk_min: int


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def find_nearest_stops(
    session: Session,
    lat: float,
    lon: float,
    stop_type: str | None = None,
    radius_km: float = 0.5,
    max_count: int = 5,
) -> list[NearbyStop]:
    """
    Return up to max_count stops within radius_km of (lat, lon).
    Uses a bounding-box SQL filter first, then exact Haversine sort.
    stop_type: 'metro' | 'bus' | 'mmts' | None (all types)
    """
    # Bounding box — slightly larger than radius to avoid edge misses
    margin = (radius_km / _KM_PER_DEG_LAT) * 1.2
    cos_lat = cos(radians(lat))
    lon_margin = margin / cos_lat if cos_lat > 0 else margin

    stmt = select(TransportStop).where(
        TransportStop.latitude.between(lat - margin, lat + margin),
        TransportStop.longitude.between(lon - lon_margin, lon + lon_margin),
    )
    if stop_type:
        stmt = stmt.where(TransportStop.stop_type == stop_type)

    candidates = session.exec(stmt).all()

    results: list[NearbyStop] = []
    for stop in candidates:
        dist_km = haversine_km(lat, lon, stop.latitude, stop.longitude)
        if dist_km <= radius_km:
            dist_m = int(dist_km * 1000)
            walk_min = max(1, round(dist_m / 80))   # ~80 m/min walking pace
            results.append(NearbyStop(
                name=stop.name,
                stop_type=stop.stop_type,
                latitude=stop.latitude,
                longitude=stop.longitude,
                distance_m=dist_m,
                walk_min=walk_min,
            ))

    results.sort(key=lambda s: s.distance_m)
    return results[:max_count]


def nearest_stop_of_type(
    session: Session,
    lat: float,
    lon: float,
    stop_type: str,
) -> NearbyStop | None:
    """Return the single nearest stop of a given type within 2 km."""
    stops = find_nearest_stops(session, lat, lon, stop_type=stop_type, radius_km=2.0, max_count=1)
    return stops[0] if stops else None
