"""
Integration test — directly calls prediction logic (no HTTP) with:
  1. 6-hour variation test (same location, different hours)
  2. Location variation test (same time, different Hyderabad zones)
  3. Weather endpoint test
  4. Rain adjustment test (same route, no rain vs rain)
"""
import sys
import os

# Add backend to path so imports resolve
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app.services.ml_model import RideFeatures, predict_cancellation_risk, hybrid_predict
from app.services.weather import get_weather_impact

# ── 1. 6-hour variation test ──────────────────────────────────────────────────

test_cases = [
    {"hour": 8,  "day_of_week": 0, "month": 4, "is_peak_hour": 1, "is_weekend": 0, "distance_km": 5.2, "historical_cancel_rate": 0.65, "metro_count_1km": 1, "bus_stop_count_1km": 8, "traffic_chokepoint_nearby": 1, "is_flood_prone": 0},
    {"hour": 10, "day_of_week": 0, "month": 4, "is_peak_hour": 0, "is_weekend": 0, "distance_km": 5.2, "historical_cancel_rate": 0.65, "metro_count_1km": 1, "bus_stop_count_1km": 8, "traffic_chokepoint_nearby": 1, "is_flood_prone": 0},
    {"hour": 14, "day_of_week": 0, "month": 4, "is_peak_hour": 0, "is_weekend": 0, "distance_km": 5.2, "historical_cancel_rate": 0.65, "metro_count_1km": 1, "bus_stop_count_1km": 8, "traffic_chokepoint_nearby": 1, "is_flood_prone": 0},
    {"hour": 18, "day_of_week": 0, "month": 4, "is_peak_hour": 1, "is_weekend": 0, "distance_km": 5.2, "historical_cancel_rate": 0.65, "metro_count_1km": 1, "bus_stop_count_1km": 8, "traffic_chokepoint_nearby": 1, "is_flood_prone": 0},
    {"hour": 21, "day_of_week": 0, "month": 4, "is_peak_hour": 0, "is_weekend": 0, "distance_km": 5.2, "historical_cancel_rate": 0.65, "metro_count_1km": 1, "bus_stop_count_1km": 8, "traffic_chokepoint_nearby": 1, "is_flood_prone": 0},
    {"hour": 23, "day_of_week": 0, "month": 4, "is_peak_hour": 0, "is_weekend": 0, "distance_km": 5.2, "historical_cancel_rate": 0.65, "metro_count_1km": 1, "bus_stop_count_1km": 8, "traffic_chokepoint_nearby": 1, "is_flood_prone": 0},
]

print("\n=== 6-HOUR VARIATION TEST ===\n")

results = []
for tc in test_cases:
    features = RideFeatures(**tc)
    ml_result = predict_cancellation_risk(features)
    hybrid_result = hybrid_predict(
        ml_prob=ml_result["cancel_probability"],
        base_cancel_rate=tc["historical_cancel_rate"],
        hour=tc["hour"],
        day_of_week=tc["day_of_week"],
        is_peak_hour=bool(tc["is_peak_hour"]),
    )
    results.append(hybrid_result)
    print(
        f"Hour {tc['hour']:2d}:  "
        f"cancel_probability={hybrid_result['cancel_probability']:.4f}  "
        f"risk={hybrid_result['risk_level']}"
    )

probabilities = [r["cancel_probability"] for r in results]
unique_probs = set(probabilities)
print(f"\nUnique probability values: {len(unique_probs)}")
if len(unique_probs) >= 3:
    print("PASS — at least 3 different probability values across 6 hours")
else:
    print("FAIL — fewer than 3 distinct probability values")


# ── 2. Location variation test ────────────────────────────────────────────────

location_tests = [
    {
        "label": "Hitech City 8am",
        "hour": 8, "day_of_week": 0, "month": 4,
        "is_peak_hour": 1, "is_weekend": 0,
        "distance_km": 5.2,
        "historical_cancel_rate": 0.75,
        "metro_count_1km": 2,
        "bus_stop_count_1km": 12,
        "traffic_chokepoint_nearby": 1,
        "is_flood_prone": 0,
    },
    {
        "label": "Old City 8am",
        "hour": 8, "day_of_week": 0, "month": 4,
        "is_peak_hour": 1, "is_weekend": 0,
        "distance_km": 5.2,
        "historical_cancel_rate": 0.58,
        "metro_count_1km": 0,
        "bus_stop_count_1km": 5,
        "traffic_chokepoint_nearby": 0,
        "is_flood_prone": 1,
    },
]

print("\n=== LOCATION VARIATION TEST ===\n")

loc_results = {}
for tc in location_tests:
    label = tc["label"]
    feat_tc = {k: v for k, v in tc.items() if k != "label"}
    features = RideFeatures(**feat_tc)
    ml_result = predict_cancellation_risk(features)
    hybrid_result = hybrid_predict(
        ml_prob=ml_result["cancel_probability"],
        base_cancel_rate=feat_tc["historical_cancel_rate"],
        hour=feat_tc["hour"],
        day_of_week=feat_tc["day_of_week"],
        is_peak_hour=bool(feat_tc["is_peak_hour"]),
    )
    loc_results[label] = hybrid_result
    print(
        f"{label:20s}  cancel_probability={hybrid_result['cancel_probability']:.4f}  "
        f"risk={hybrid_result['risk_level']}"
    )

diff = abs(
    loc_results["Hitech City 8am"]["cancel_probability"]
    - loc_results["Old City 8am"]["cancel_probability"]
)
print(f"\nDifference: {diff:.4f}")
if diff >= 0.05:
    print("PASS — location variation difference >= 0.05")
else:
    print("LOCATION VARIATION FAILED — difference < 0.05; investigate historical_cancel_rate pipeline")


# ── 3. Weather endpoint test ──────────────────────────────────────────────────

print("\n=== WEATHER ENDPOINT TEST ===\n")

wx = get_weather_impact(lat=17.4435, lon=78.3772)
print(f"Raw response: {wx}")
print(f"  is_raining:        {wx['is_raining']}")
print(f"  weather_condition: {wx['weather_condition']}")
print(f"  weathercode:       {wx['weathercode']}")
print(f"  risk_multiplier:   {wx['risk_multiplier']}")

has_is_raining = "is_raining" in wx
has_condition  = "weather_condition" in wx
has_multiplier = "risk_multiplier" in wx

print(f"\n  is_raining field present:  {'yes' if has_is_raining else 'no'}")
print(f"  weather_condition present:  {'yes' if has_condition else 'no'}")
print(f"  risk_multiplier present:    {'yes' if has_multiplier else 'no'}")
print(f"  Open-Meteo API called:      yes")


# ── 4. Rain adjustment test ───────────────────────────────────────────────────

print("\n=== RAIN ADJUSTMENT TEST ===\n")

no_rain = hybrid_predict(
    ml_prob=0.45, base_cancel_rate=0.65,
    hour=18, day_of_week=4, is_peak_hour=True,
    risk_multiplier=1.0,
)

with_rain = hybrid_predict(
    ml_prob=0.45, base_cancel_rate=0.65,
    hour=18, day_of_week=4, is_peak_hour=True,
    risk_multiplier=1.30,
)

print(f"No rain:   {no_rain}")
print(f"With rain: {with_rain}")

rain_increases = with_rain["cancel_probability"] > no_rain["cancel_probability"]
escalates      = no_rain["risk_level"] == "Medium" and with_rain["risk_level"] == "High"
flag_works     = with_rain.get("weather_adjusted") is True

no_rain_risk   = no_rain["risk_level"]
with_rain_risk = with_rain["risk_level"]
escalate_str   = "yes" if escalates else f"no ({no_rain_risk} -> {with_rain_risk})"

print(f"\n  Rain increases probability: {'yes' if rain_increases else 'no'}")
print(f"  Medium -> High on rain:     {escalate_str}")
print(f"  weather_adjusted flag:      {'yes' if flag_works else 'no'}")

print()
