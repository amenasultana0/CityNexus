"""
CityNexus — Cancellation Risk ML Service
Loads the 11-feature XGBoost model and scaler trained on pre-booking features only.
Provides a hybrid predictor combining ML probability with NammaYatri rule-based data.
"""

import os
from dataclasses import dataclass

import joblib
import numpy as np
import pandas as pd

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "model")
_OUTPUTS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "outputs")

# Load constituency cancellation rates at startup
_CONSTITUENCY_CSV = os.path.join(_OUTPUTS_DIR, "Calibration_HYDERABAD_constituency_funnel.csv")
_constituency_df = pd.read_csv(_CONSTITUENCY_CSV)
CONSTITUENCY_CANCEL_RATES: dict[int, float] = dict(
    zip(_constituency_df["ac_num"], _constituency_df["cancellation_rate"])
)

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


def rule_based_probability(base_cancel_rate: float, hour: int, day_of_week: int, is_peak_hour: bool) -> float:
    """Calculate rule-based cancellation probability using NammaYatri-derived adjustments."""
    prob = base_cancel_rate

    if is_peak_hour:
        prob *= 1.15

    if day_of_week == 4:        # Friday
        prob *= 1.10
    elif day_of_week in [5, 6]: # Weekend
        prob *= 0.90
    elif day_of_week == 0:      # Monday
        prob *= 1.05

    if hour >= 22 or hour <= 5:
        prob *= 0.85

    return min(prob, 0.95)


def hybrid_predict(
    ml_prob: float,
    base_cancel_rate: float,
    hour: int,
    day_of_week: int,
    is_peak_hour: bool,
    risk_multiplier: float = 1.0,
) -> dict:
    """Combine ML probability (40%) with rule-based probability (60%) for final cancellation risk."""
    rule_prob = rule_based_probability(base_cancel_rate, hour, day_of_week, is_peak_hour)
    final_prob = (ml_prob * 0.4) + (rule_prob * 0.6)

    # Apply weather multiplier (capped at 0.95)
    final_prob = min(final_prob * risk_multiplier, 0.95)

    if final_prob >= 0.55:
        risk = "High"
    elif final_prob >= 0.35:
        risk = "Medium"
    else:
        risk = "Low"

    return {
        "cancel_probability": round(final_prob, 4),
        "risk_level": risk,
        "ml_probability": round(ml_prob, 4),
        "rule_probability": round(rule_prob, 4),
        "confidence": round(max(final_prob, 1 - final_prob), 4),
        "weather_adjusted": risk_multiplier > 1.0,
    }


def predict_cancellation_risk(features: RideFeatures) -> dict:
    """Return cancellation probability and risk label for given pre-booking features."""
    arr = _features_to_array(features)
    proba = model.predict_proba(arr)[0]
    cancel_prob = float(proba[1])

    if cancel_prob >= 0.55:
        risk = "High"
    elif cancel_prob >= 0.35:
        risk = "Medium"
    else:
        risk = "Low"

    return {
        "cancel_probability": round(cancel_prob, 4),
        "risk_level": risk,
        "confidence": round(float(np.max(proba)), 4),
    }
