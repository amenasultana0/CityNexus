"""
ML cancellation risk prediction service.

Tries to load backend/app/model/cancellation_model.pkl at import time.
If the file is missing or fails to load, falls back to rule-based predictions
(all zones Medium, rain escalates to High).

When the teammate pushes the .pkl to the correct path and the container
restarts, real predictions activate automatically — no code change needed.
"""

import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

MODEL_PATH = Path(__file__).parent.parent / "model" / "cancellation_model.pkl"

# Risk thresholds
LOW_THRESHOLD = 0.20
HIGH_THRESHOLD = 0.50

# Hyderabad rule: no Low zones — floor is Medium
HYDERABAD_MIN_RISK = "medium"

# ── Try to load model at import ──────────────────────────────
_model = None
_model_available = False

try:
    import pickle
    if MODEL_PATH.exists():
        with open(MODEL_PATH, "rb") as f:
            _model = pickle.load(f)
        _model_available = True
        logger.info("ML model loaded from %s", MODEL_PATH)
    else:
        logger.warning(
            "Model file not found at %s — using rule-based fallback. "
            "Drop the .pkl file there and restart to enable real predictions.",
            MODEL_PATH,
        )
except Exception as exc:
    logger.warning("Failed to load ML model (%s) — using rule-based fallback.", exc)


# ── Input feature set ────────────────────────────────────────
@dataclass
class RideFeatures:
    hour: int           # 0–23
    day_of_week: int    # 0=Mon … 6=Sun
    month: int          # 1–12
    metro_count_1km: int = 0
    bus_stop_count_1km: int = 0
    traffic_chokepoint_nearby: bool = False
    is_flood_prone: bool = False
    commercial_density_1km: int = 0
    nearest_metro_distance_km: float = 5.0
    historical_cancel_rate: float = 0.57   # Hyderabad average


# ── Output ───────────────────────────────────────────────────
@dataclass
class PredictionResult:
    risk_level: str     # medium | high  (never low in Hyderabad)
    probability: float
    using_fallback: bool


# ── Peak-hour multipliers for rule-based fallback ────────────
_PEAK_HOURS = {7, 8, 9, 18, 19, 20}
_HYDERABAD_BASE_CANCEL = 0.57   # average bkng_cancel_rate from constituency funnel


def _rule_based_predict(features: RideFeatures, is_raining: bool) -> PredictionResult:
    """Simple rule-based fallback used when model is unavailable."""
    prob = features.historical_cancel_rate

    # Peak hour boost
    if features.hour in _PEAK_HOURS:
        prob = min(0.95, prob * 1.15)

    # Traffic area boost
    if features.traffic_chokepoint_nearby:
        prob = min(0.95, prob * 1.05)

    # Rain escalation: clamp to High territory
    if is_raining:
        prob = min(0.95, prob * 1.25)

    # Hyderabad rule: floor is Medium (never Low)
    risk = "high" if prob >= HIGH_THRESHOLD else "medium"
    return PredictionResult(risk_level=risk, probability=round(prob, 3), using_fallback=True)


def _features_to_array(features: RideFeatures):
    """Convert RideFeatures to a numpy array matching the trained model's feature order."""
    import numpy as np
    return np.array([[
        features.hour,
        features.day_of_week,
        features.month,
        features.metro_count_1km,
        features.bus_stop_count_1km,
        int(features.traffic_chokepoint_nearby),
        int(features.is_flood_prone),
        features.commercial_density_1km,
        features.nearest_metro_distance_km,
        features.historical_cancel_rate,
    ]])


def predict(features: RideFeatures, is_raining: bool = False) -> PredictionResult:
    """
    Main prediction entry point.
    Uses real model if available, otherwise rule-based fallback.
    Rain escalation applied on top of either path.
    """
    if _model_available and _model is not None:
        try:
            x = _features_to_array(features)
            prob = float(_model.predict_proba(x)[0][1])

            # Hyderabad calibration: floor probability at medium threshold
            prob = max(prob, LOW_THRESHOLD + 0.01)

            # Rain escalation
            if is_raining:
                prob = min(0.95, prob * 1.25)

            risk = "high" if prob >= HIGH_THRESHOLD else "medium"
            return PredictionResult(risk_level=risk, probability=round(prob, 3), using_fallback=False)

        except Exception as exc:
            logger.warning("Model prediction failed (%s) — falling back to rules.", exc)

    return _rule_based_predict(features, is_raining)


def is_model_loaded() -> bool:
    return _model_available
