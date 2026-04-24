"""
CityNexus — Cancellation Risk ML Service
Loads the 11-feature XGBoost model and scaler trained on pre-booking features only.
"""

import os
from dataclasses import dataclass

import joblib
import numpy as np

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "model")

model  = joblib.load(os.path.join(_MODEL_DIR, "cancellation_model.pkl"))
scaler = joblib.load(os.path.join(_MODEL_DIR, "cancellation_scaler.pkl"))


@dataclass
class RideFeatures:
    hour: int
    day_of_week: int
    month: int
    is_peak_hour: int
    is_weekend: int
    distance_km: float
    historical_cancel_rate: float
    metro_count_1km: int
    bus_stop_count_1km: int
    traffic_chokepoint_nearby: int
    is_flood_prone: int


def _features_to_array(features: RideFeatures) -> np.ndarray:
    arr = np.array([[
        features.hour,
        features.day_of_week,
        features.month,
        features.is_peak_hour,
        features.is_weekend,
        features.distance_km,
        features.historical_cancel_rate,
        features.metro_count_1km,
        features.bus_stop_count_1km,
        features.traffic_chokepoint_nearby,
        features.is_flood_prone,
    ]])
    return scaler.transform(arr)


def predict_cancellation_risk(features: RideFeatures) -> dict:
    """Return cancellation probability and risk label for given pre-booking features."""
    arr = _features_to_array(features)
    proba = model.predict_proba(arr)[0]
    cancel_prob = float(proba[1])

    if cancel_prob >= 0.6:
        risk = "high"
    elif cancel_prob >= 0.4:
        risk = "medium"
    else:
        risk = "low"

    return {
        "cancellation_probability": round(cancel_prob, 4),
        "risk_level": risk,
        "not_cancelled_probability": round(float(proba[0]), 4),
    }
