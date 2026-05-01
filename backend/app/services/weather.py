"""
Weather service — fetches current conditions for Hyderabad via Open-Meteo.
Free API, no key required. Result cached for 15 minutes.
"""

import logging
import time
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

# Hyderabad city centre coordinates
_HYD_LAT = 17.385
_HYD_LON = 78.486

_OPEN_METEO_URL = (
    "https://api.open-meteo.com/v1/forecast"
    f"?latitude={_HYD_LAT}&longitude={_HYD_LON}"
    "&current_weather=true"
    "&hourly=precipitation"
    "&forecast_days=1"
)

# WMO weather codes that indicate rain
_RAIN_CODES = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99}

_CACHE_TTL = 15 * 60   # 15 minutes in seconds
_cache: dict = {}


@dataclass
class WeatherResult:
    is_raining: bool
    temperature_c: float
    windspeed_kmh: float
    weather_code: int
    conditions: str
    cached: bool


def _code_to_conditions(code: int) -> str:
    if code == 0:
        return "Clear sky"
    if code in (1, 2, 3):
        return "Partly cloudy"
    if code in (45, 48):
        return "Foggy"
    if code in (51, 53, 55):
        return "Drizzle"
    if code in (61, 63, 65):
        return "Rain"
    if code in (66, 67):
        return "Freezing rain"
    if code in (80, 81, 82):
        return "Rain showers"
    if code in (95, 96, 99):
        return "Thunderstorm"
    return "Unknown"


def get_weather() -> WeatherResult:
    """Return current Hyderabad weather, using a 15-min in-memory cache."""
    now = time.time()

    if "data" in _cache and (now - _cache.get("ts", 0)) < _CACHE_TTL:
        return WeatherResult(**_cache["data"], cached=True)

    try:
        resp = httpx.get(_OPEN_METEO_URL, timeout=5.0)
        resp.raise_for_status()
        cw = resp.json()["current_weather"]

        code = int(cw["weathercode"])
        result_data = {
            "is_raining": code in _RAIN_CODES,
            "temperature_c": float(cw["temperature"]),
            "windspeed_kmh": float(cw["windspeed"]),
            "weather_code": code,
            "conditions": _code_to_conditions(code),
        }
        _cache["data"] = result_data
        _cache["ts"] = now
        return WeatherResult(**result_data, cached=False)

    except Exception as exc:
        logger.warning("Open-Meteo request failed (%s) — returning dry weather default.", exc)
        return WeatherResult(
            is_raining=False,
            temperature_c=28.0,
            windspeed_kmh=10.0,
            weather_code=0,
            conditions="Unknown (API unavailable)",
            cached=False,
        )
