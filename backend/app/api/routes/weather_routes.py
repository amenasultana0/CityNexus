"""
Weather API — current conditions and their impact on ride cancellation risk.
Single endpoint, no auth required.
"""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.services import weather as weather_svc

router = APIRouter(tags=["weather"])


class WeatherImpactResponse(BaseModel):
    is_raining: bool
    temperature_c: float
    windspeed_kmh: float
    weather_code: int
    conditions: str
    risk_impact: str        # human-readable summary of how weather affects rides
    cancel_rate_multiplier: float
    surge_multiplier_cab: float
    surge_multiplier_auto: float
    surge_multiplier_bike: float
    cached: bool


@router.get("/impact", response_model=WeatherImpactResponse)
def weather_impact() -> Any:
    """
    Return current Hyderabad weather and its effect on ride availability and pricing.
    Uses a 15-minute cache. Coordinates are fixed to Hyderabad city centre.
    """
    wx = weather_svc.get_weather()

    if wx.is_raining:
        risk_impact = "Rain detected — all Medium zones escalated to High. Expect 25% higher cancellation rates."
        cancel_rate_multiplier = 1.25
        surge_multiplier_cab = 2.0
        surge_multiplier_auto = 1.5
        surge_multiplier_bike = 1.8
    else:
        risk_impact = "No rain — standard cancellation rates apply."
        cancel_rate_multiplier = 1.0
        surge_multiplier_cab = 1.0
        surge_multiplier_auto = 1.0
        surge_multiplier_bike = 1.0

    return WeatherImpactResponse(
        is_raining=wx.is_raining,
        temperature_c=wx.temperature_c,
        windspeed_kmh=wx.windspeed_kmh,
        weather_code=wx.weather_code,
        conditions=wx.conditions,
        risk_impact=risk_impact,
        cancel_rate_multiplier=cancel_rate_multiplier,
        surge_multiplier_cab=surge_multiplier_cab,
        surge_multiplier_auto=surge_multiplier_auto,
        surge_multiplier_bike=surge_multiplier_bike,
        cached=wx.cached,
    )
