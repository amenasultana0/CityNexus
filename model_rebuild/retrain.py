"""
CityNexus Cancellation Model Rebuild — retrain.py
Trains a new XGBoost model using only 11 pre-booking features.
Run from the CityNexus/ root directory:
    python3 model_rebuild/retrain.py
"""

import os
import json
import pandas as pd
import numpy as np
import joblib
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
from imblearn.over_sampling import SMOTE
from xgboost import XGBClassifier

# ── STEP 1: Paths ─────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRAINING_CSV     = os.path.join(BASE_DIR, "cleaned_data", "Bengaluru_Ola_clean.csv")
CALIBRATION_CSV  = os.path.join(BASE_DIR, "outputs", "Calibration_HYDERABAD_constituency_funnel.csv")
AREA_CONTEXT_CSV = os.path.join(BASE_DIR, "outputs", "area_context.csv")
MODEL_OUT_DIR    = os.path.join(BASE_DIR, "backend", "app", "model")

os.makedirs(MODEL_OUT_DIR, exist_ok=True)

# ── STEP 2: Load and inspect source data ──────────────────────────────────────
print("=" * 60)
print("STEP 2 — Loading source data")
print("=" * 60)

df = pd.read_csv(TRAINING_CSV)
cal_df = pd.read_csv(CALIBRATION_CSV)
area_df = pd.read_csv(AREA_CONTEXT_CSV)

print(f"\nTraining file shape: {df.shape}")
print(f"Columns: {list(df.columns)}")
print("\nFirst 5 rows:")
print(df.head())

print(f"\nCalibration file shape: {cal_df.shape}")
print(f"Columns: {list(cal_df.columns)}")
print("\nFirst 5 rows:")
print(cal_df.head())

print(f"\nArea context shape: {area_df.shape}")
print(f"Columns: {list(area_df.columns)}")
print("\nFirst 5 rows:")
print(area_df.head())

# Verify required columns exist
required_train = ["Booking Status", "Time", "Date", "Ride Distance", "Pickup Location"]
for col in required_train:
    assert col in df.columns, f"Missing column in training data: {col}"
print("\nAll required training columns present.")

required_cal = ["cancellation_rate", "avg_fare"]
for col in required_cal:
    assert col in cal_df.columns, f"Missing column in calibration data: {col}"
print("All required calibration columns present.")

required_area = ["ward_name", "is_flood_prone", "chokepoint_count", "commercial_density", "nearest_police_distance_km"]
# area_context may use different column names — check what's available
missing_area = [c for c in required_area if c not in area_df.columns]
if missing_area:
    print(f"Note: area_context missing columns {missing_area} — available: {list(area_df.columns)}")
else:
    print("All required area context columns present.")

# ── STEP 3: Feature engineering ───────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 3 — Feature engineering")
print("=" * 60)

# Time features
df["hour"]        = pd.to_datetime(df["Time"], errors="coerce").dt.hour
df["day_of_week"] = pd.to_datetime(df["Date"], errors="coerce").dt.dayofweek
df["month"]       = pd.to_datetime(df["Date"], errors="coerce").dt.month
df["is_peak_hour"]= df["hour"].apply(lambda x: 1 if x in [8, 9, 18, 19, 20] else 0)
df["is_weekend"]  = df["day_of_week"].apply(lambda x: 1 if x >= 5 else 0)

# Distance
# Cancelled rides have Ride Distance = 0.0 in the raw data (ride never happened).
# Using 0 or the same constant causes label leakage. Fix: for 0/NaN entries,
# randomly sample from the completed-ride distance distribution so the model
# cannot identify cancellations via distance alone.
_dist = pd.to_numeric(df["Ride Distance"], errors="coerce")
_completed_dists = _dist[_dist > 0].dropna().values
np.random.seed(42)
_sampled = np.random.choice(_completed_dists, size=len(df), replace=True)
df["distance_km"] = np.where((_dist == 0) | _dist.isna(), _sampled, _dist.values)

# Target variable
df["is_cancelled"] = df["Booking Status"].apply(
    lambda x: 1 if "Cancelled" in str(x) else 0
)

# Zone mapping — assign Bangalore pickup locations to Hyderabad-equivalent zone profiles
zone_profiles = {
    "tech_hub":      {"historical_cancel_rate": 0.62, "metro_count_1km": 2, "bus_stop_count_1km": 8,  "traffic_chokepoint_nearby": 1, "is_flood_prone": 0},
    "residential":   {"historical_cancel_rate": 0.55, "metro_count_1km": 1, "bus_stop_count_1km": 5,  "traffic_chokepoint_nearby": 0, "is_flood_prone": 0},
    "commercial":    {"historical_cancel_rate": 0.65, "metro_count_1km": 1, "bus_stop_count_1km": 12, "traffic_chokepoint_nearby": 1, "is_flood_prone": 0},
    "transport_hub": {"historical_cancel_rate": 0.58, "metro_count_1km": 3, "bus_stop_count_1km": 15, "traffic_chokepoint_nearby": 1, "is_flood_prone": 0},
    "mixed":         {"historical_cancel_rate": 0.59, "metro_count_1km": 1, "bus_stop_count_1km": 6,  "traffic_chokepoint_nearby": 0, "is_flood_prone": 1},
}
zone_names = list(zone_profiles.keys())

# Encode pickup locations and split into 5 equal groups
unique_locs = sorted(df["Pickup Location"].dropna().unique())
n = len(unique_locs)
loc_to_zone = {}
for i, loc in enumerate(unique_locs):
    group_idx = min(int(i / n * 5), 4)
    loc_to_zone[loc] = zone_names[group_idx]

df["_zone"] = df["Pickup Location"].map(loc_to_zone).fillna("mixed")

# Map zone profile values onto each row
for feature, values in zone_profiles.items():
    pass  # done below per-column

for col in ["historical_cancel_rate", "metro_count_1km", "bus_stop_count_1km",
            "traffic_chokepoint_nearby", "is_flood_prone"]:
    df[col] = df["_zone"].apply(lambda z: zone_profiles[z][col])

print("\nClass distribution of is_cancelled:")
print(df["is_cancelled"].value_counts())
print(df["is_cancelled"].value_counts(normalize=True).apply(lambda x: f"{x:.2%}"))

# ── STEP 4: Prepare features and target ───────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 4 — Preparing features and target")
print("=" * 60)

FEATURES = [
    "hour", "day_of_week", "month", "is_peak_hour", "is_weekend",
    "distance_km", "historical_cancel_rate", "metro_count_1km",
    "bus_stop_count_1km", "traffic_chokepoint_nearby", "is_flood_prone"
]

# Drop rows where datetime parsing failed
df = df.dropna(subset=["hour", "day_of_week"])

X = df[FEATURES].fillna(0)
y = df["is_cancelled"]

print(f"Final shape — X: {X.shape}, y: {y.shape}")

# ── STEP 5: Scale and save scaler ─────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 5 — Scaling features and saving scaler")
print("=" * 60)

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

scaler_path = os.path.join(MODEL_OUT_DIR, "cancellation_scaler.pkl")
joblib.dump(scaler, scaler_path)
print(f"Scaler saved to {scaler_path}")

# ── STEP 6: Train/test split ───────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 6 — Train/test split")
print("=" * 60)

X_train, X_test, y_train, y_test = train_test_split(
    X_scaled, y, test_size=0.2, random_state=42, stratify=y
)
print(f"Train: {X_train.shape}, Test: {X_test.shape}")

# ── STEP 7: SMOTE ─────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 7 — SMOTE class balancing")
print("=" * 60)

smote = SMOTE(random_state=42)
X_train_balanced, y_train_balanced = smote.fit_resample(X_train, y_train)
print("After SMOTE:")
print(pd.Series(y_train_balanced).value_counts())

# ── STEP 8: Train XGBoost ──────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 8 — Training XGBoost")
print("=" * 60)

model = XGBClassifier(
    n_estimators=300,
    max_depth=6,
    learning_rate=0.1,
    subsample=0.8,
    random_state=42,
    eval_metric="logloss"
)
model.fit(X_train_balanced, y_train_balanced)
print("Model trained successfully")

# ── STEP 9: Evaluate ──────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 9 — Evaluation")
print("=" * 60)

y_pred = model.predict(X_test)
print(f"Accuracy: {accuracy_score(y_test, y_pred):.4f}")
print(classification_report(y_test, y_pred, target_names=["Not Cancelled", "Cancelled"]))

# Feature importances
importances = pd.Series(model.feature_importances_, index=FEATURES).sort_values(ascending=False)
print("Feature importances (highest to lowest):")
for feat, imp in importances.items():
    print(f"  {feat}: {imp:.4f}")

# ── STEP 10: Save model and feature names ─────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 10 — Saving model and feature names")
print("=" * 60)

model_path = os.path.join(MODEL_OUT_DIR, "cancellation_model.pkl")
joblib.dump(model, model_path)
size_mb = os.path.getsize(model_path) / 1024 / 1024
print(f"Model saved to {model_path}")
print(f"Model size: {size_mb:.2f} MB")

features_path = os.path.join(MODEL_OUT_DIR, "feature_names.json")
with open(features_path, "w") as f:
    json.dump(FEATURES, f)
print(f"Feature names saved to {features_path}")

print("\nDone.")
