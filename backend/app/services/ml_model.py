"""
ML cancellation risk prediction service.

Tries to load backend/app/model/cancellation_model.pkl at import time.
If the file is missing or fails to load, falls back to rule-based predictions
(all zones Medium, rain escalates to High).

Model was trained on 18 features (booking-level + temporal + location):
  Avg VTAT, Avg CTAT, Cancelled by Customer, Cancelled Rides by Driver,
  Incomplete Rides, Booking Value, Ride Distance, Driver Ratings, Customer Rating,
  hour, day_of_week, month, is_weekend, is_peak_hour,
  Vehicle_Type_encoded, Pickup_Location_encoded, Drop_Location_encoded,
  Payment_Method_encoded
"""

import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

MODEL_PATH = Path(__file__).parent.parent / "model" / "cancellation_model.pkl"

# Risk thresholds
LOW_THRESHOLD = 0.20
HIGH_THRESHOLD = 0.50

# Peak hours from demand_summary.json
_PEAK_HOURS = {8, 9, 10, 16, 17, 18}

# Hyderabad base cancellation rate (average)
_HYDERABAD_BASE_CANCEL = 0.57

# Calibration: (ac_num, cancel_rate) from hyderabad_calibration.csv
# Used to map historical cancel rate → nearest location encoding
_AC_CALIBRATION = [
    (9, 0.5868), (10, 0.5641), (11, 0.5429), (12, 0.5973), (13, 0.5807),
    (14, 0.6299), (15, 0.8421), (16, 0.6140), (17, 0.5895), (18, 0.5421),
    (57, 0.5545), (79, 0.5667), (82, 0.5567), (83, 0.5629), (86, 0.5880),
    (87, 0.5989), (88, 0.5763), (89, 0.5526), (103, 0.5589), (104, 0.6237),
    (105, 0.6022), (106, 0.5531), (107, 0.5835), (108, 0.5590),
]


def _rate_to_ac_num(cancel_rate: float) -> int:
    """Map a historical cancel rate to nearest ac_num from calibration data."""
    return min(_AC_CALIBRATION, key=lambda x: abs(x[1] - cancel_rate))[0]


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
    distance_km: float = 0.0              # trip distance (km)


# ── Output ───────────────────────────────────────────────────
@dataclass
class PredictionResult:
    risk_level: str     # low | medium | high
    probability: float
    using_fallback: bool


def _rule_based_predict(features: RideFeatures, is_raining: bool) -> PredictionResult:
    """Simple rule-based fallback used when model is unavailable."""
    prob = features.historical_cancel_rate

    if features.hour in _PEAK_HOURS:
        prob = min(0.95, prob * 1.15)

    if features.traffic_chokepoint_nearby:
        prob = min(0.95, prob * 1.05)

    if is_raining:
        prob = min(0.95, prob * 1.25)

    risk = "high" if prob >= HIGH_THRESHOLD else "medium"
    return PredictionResult(risk_level=risk, probability=round(prob, 3), using_fallback=True)


def _features_to_array(features: RideFeatures):
    """
    Build 18-feature numpy array matching the trained model's column order
    (X_train_final.csv minus Source_encoded):

    Avg VTAT, Avg CTAT, Cancelled by Customer, Cancelled Rides by Driver,
    Incomplete Rides, Booking Value, Ride Distance, Driver Ratings, Customer Rating,
    hour, day_of_week, month, is_weekend, is_peak_hour,
    Vehicle_Type_encoded, Pickup_Location_encoded, Drop_Location_encoded,
    Payment_Method_encoded
    """
    import numpy as np

    is_weekend = 1 if features.day_of_week >= 5 else 0
    is_peak_hour = 1 if features.hour in _PEAK_HOURS else 0

    # Standardized booking-level features we don't have at prediction time:
    # use 0.0 (mean of z-score distribution = neutral/average value)
    avg_vtat = 0.0
    avg_ctat = 0.0
    cancelled_by_customer = 0
    cancelled_by_driver = 0
    incomplete_rides = 0
    booking_value = 0.0
    # Rough standardization: training data mean ~10 km, std ~8 km
    ride_distance = (features.distance_km - 10.0) / 8.0
    driver_ratings = 0.0
    customer_rating = 0.0

    # Map historical cancel rate → nearest ac_num location encoding
    location_encoded = _rate_to_ac_num(features.historical_cancel_rate)

    vehicle_type = 1    # 1 = Auto/Mini (most common)
    payment_method = 1  # 1 = UPI/Cash (most common)

    return np.array([[
        avg_vtat, avg_ctat, cancelled_by_customer, cancelled_by_driver,
        incomplete_rides, booking_value, ride_distance, driver_ratings, customer_rating,
        features.hour, features.day_of_week, features.month,
        is_weekend, is_peak_hour,
        vehicle_type, location_encoded, location_encoded, payment_method,
    ]])


def predict(features: RideFeatures, is_raining: bool = False) -> PredictionResult:
    """
    Main prediction entry point.
    Uses real XGBoost model if available, otherwise rule-based fallback.
    Model is a 3-class classifier: 0=Low, 1=Medium, 2=High.
    Rain escalation applied on top of either path.
    """
    import numpy as np

    if _model_available and _model is not None:
        try:
            x = _features_to_array(features)
            proba = _model.predict_proba(x)[0]   # [P(Low), P(Medium), P(High)]
            predicted_class = int(np.argmax(proba))

            # Map predicted class → risk level
            # Hyderabad floor rule: never return Low (floor = medium)
            if predicted_class == 2:
                risk = "high"
                prob = float(proba[2])
            else:
                risk = "medium"
                prob = float(proba[1] + proba[2])  # P(medium or higher)

            # Minimum probability floor
            prob = max(prob, LOW_THRESHOLD + 0.01)

            # Rain escalation
            if is_raining:
                prob = min(0.95, prob * 1.25)
                if prob >= HIGH_THRESHOLD:
                    risk = "high"

            return PredictionResult(risk_level=risk, probability=round(prob, 3), using_fallback=False)

        except Exception as exc:
            logger.warning("Model prediction failed (%s) — falling back to rules.", exc)

    return _rule_based_predict(features, is_raining)


def is_model_loaded() -> bool:
    return _model_available
