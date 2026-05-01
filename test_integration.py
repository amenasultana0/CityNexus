"""
Integration test — directly calls prediction logic (no HTTP) with 6 test cases
across different hours for the same location.
"""
import sys
import os

# Add backend to path so imports resolve
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app.services.ml_model import RideFeatures, predict_cancellation_risk, hybrid_predict

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
    print("FAIL — fewer than 3 distinct probability values; model may not be responding to hour changes")

print()
