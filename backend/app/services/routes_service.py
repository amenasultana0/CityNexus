"""
Google Routes API service — real road distance and travel time.
Replaces haversine straight-line estimates for all cost calculations.

Uses GOOGLE_MAPS_BACKEND_KEY from .env (already present).
Falls back to haversine × 1.4 road factor if API call fails,
so the app never crashes due to a quota or network error.
"""

import logging

import httpx

from app.core.config import settings
from app.services.cost import haversine_km

logger = logging.getLogger(__name__)

_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
_FIELD_MASK = "routes.distanceMeters,routes.duration,routes.travelAdvisory"


def get_road_distance(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
) -> tuple[float, float]:
    """
    Call Google Routes API and return (road_distance_km, duration_min).

    Uses TRAFFIC_AWARE routing for realistic road distance.
    Falls back to haversine × 1.4 on any failure so callers never crash.

    Args:
        origin_lat, origin_lon: Start coordinates
        dest_lat, dest_lon:     End coordinates

    Returns:
        (distance_km, duration_min) — both floats, rounded to 2dp
    """
    api_key = getattr(settings, "GOOGLE_MAPS_BACKEND_KEY", None)

    if not api_key:
        logger.warning("GOOGLE_MAPS_BACKEND_KEY not set — falling back to haversine")
        return _haversine_fallback(origin_lat, origin_lon, dest_lat, dest_lon)

    payload = {
        "origin": {
            "location": {"latLng": {"latitude": origin_lat, "longitude": origin_lon}}
        },
        "destination": {
            "location": {"latLng": {"latitude": dest_lat, "longitude": dest_lon}}
        },
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE",
        "computeAlternativeRoutes": False,
        "languageCode": "en-US",
        "units": "METRIC",
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": _FIELD_MASK,
    }

    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.post(_ROUTES_URL, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()

        routes = data.get("routes")
        if not routes:
            logger.warning("Routes API returned no routes — falling back to haversine")
            return _haversine_fallback(origin_lat, origin_lon, dest_lat, dest_lon)

        route = routes[0]
        distance_km = round(route["distanceMeters"] / 1000, 2)

        # duration is returned as e.g. "754s"
        duration_str = route.get("duration", "0s")
        duration_min = round(int(duration_str.replace("s", "")) / 60, 2)

        return distance_km, duration_min

    except httpx.TimeoutException:
        logger.warning("Routes API timed out — falling back to haversine")
    except httpx.HTTPStatusError as e:
        logger.warning("Routes API HTTP error %s — falling back to haversine", e.response.status_code)
    except Exception as e:
        logger.warning("Routes API unexpected error: %s — falling back to haversine", e)

    return _haversine_fallback(origin_lat, origin_lon, dest_lat, dest_lon)


def _haversine_fallback(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
) -> tuple[float, float]:
    """Straight-line × 1.4 road factor. Duration estimated at 30 km/h average."""
    straight_km = haversine_km(origin_lat, origin_lon, dest_lat, dest_lon)
    road_km = round(straight_km * 1.4, 2)
    duration_min = round(road_km / 30 * 60, 2)
    return road_km, duration_min