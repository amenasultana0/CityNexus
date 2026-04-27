"""
CityNexus Cancellation Model Rebuild — retrain.py
Trains a new XGBoost model using only 11 pre-booking features.
v2: 25 real Hyderabad constituency profiles (expanded from 5 generic zones).
Run from the CityNexus/ root directory:
    python3 model_rebuild/retrain.py
"""

import os
import json
import subprocess
import pandas as pd
import numpy as np
import joblib
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
from xgboost import XGBClassifier
from imblearn.over_sampling import SMOTE

# ── STEP 1: Paths ─────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRAINING_CSV     = os.path.join(BASE_DIR, "cleaned_data", "Bengaluru_Ola_clean.csv")
CALIBRATION_CSV  = os.path.join(BASE_DIR, "outputs", "Calibration_HYDERABAD_constituency_funnel.csv")
MODEL_OUT_DIR    = os.path.join(BASE_DIR, "backend", "app", "model")

os.makedirs(MODEL_OUT_DIR, exist_ok=True)

# ── STEP 1 (user): Load calibration CSV and print columns + first 5 rows ──────
print("=" * 60)
print("STEP 1 — Calibration CSV inspection")
print("=" * 60)

cal_df = pd.read_csv(CALIBRATION_CSV)
print(f"\nColumns: {list(cal_df.columns)}")
print(f"\nFirst 5 rows:")
print(cal_df.head())

# ── STEP 2: Build 25 constituency profiles ────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 2 — Building 25 constituency profiles")
print("=" * 60)

def assign_zone_features(rate):
    """Assign infrastructure features based on cancellation rate band."""
    if rate > 0.70:
        return {"metro_count_1km": 1, "bus_stop_count_1km": 12, "traffic_chokepoint_nearby": 1, "is_flood_prone": 0}
    elif rate >= 0.60:
        return {"metro_count_1km": 1, "bus_stop_count_1km": 8,  "traffic_chokepoint_nearby": 1, "is_flood_prone": 0}
    elif rate >= 0.55:
        return {"metro_count_1km": 0, "bus_stop_count_1km": 5,  "traffic_chokepoint_nearby": 0, "is_flood_prone": 1}
    else:
        return {"metro_count_1km": 0, "bus_stop_count_1km": 3,  "traffic_chokepoint_nearby": 0, "is_flood_prone": 0}

constituency_profiles = []
for _, row in cal_df.iterrows():
    rate = row["cancellation_rate"]
    features = assign_zone_features(rate)
    profile = {
        "ac_num": str(row["ac_num"]),
        "historical_cancel_rate": rate,
        **features,
    }
    constituency_profiles.append(profile)

# Sort by cancellation_rate ascending (lowest to highest) for deterministic group mapping
constituency_profiles.sort(key=lambda p: p["historical_cancel_rate"])

print(f"\nTotal constituency profiles built: {len(constituency_profiles)}")
print("\nProfile summary (ac_num | cancel_rate | metro | bus | choke | flood):")
for p in constituency_profiles:
    print(
        f"  ac={p['ac_num']:>8s}  rate={p['historical_cancel_rate']:.4f}"
        f"  metro={p['metro_count_1km']}  bus={p['bus_stop_count_1km']:>2d}"
        f"  choke={p['traffic_chokepoint_nearby']}  flood={p['is_flood_prone']}"
    )

# ── STEP 3: Load training data and assign 25 constituency groups ───────────────
print("\n" + "=" * 60)
print("STEP 3 — Loading training data and assigning 25 constituency groups")
print("=" * 60)

df = pd.read_csv(TRAINING_CSV)
print(f"Training file shape: {df.shape}")

# Time features
df["hour"]        = pd.to_datetime(df["Time"], errors="coerce").dt.hour
df["day_of_week"] = pd.to_datetime(df["Date"], errors="coerce").dt.dayofweek
df["month"]       = pd.to_datetime(df["Date"], errors="coerce").dt.month
df["is_peak_hour"]= df["hour"].apply(lambda x: 1 if x in [8, 9, 18, 19, 20] else 0)
df["is_weekend"]  = df["day_of_week"].apply(lambda x: 1 if x >= 5 else 0)

# Distance — avoid label leakage from 0-distance cancelled rides
_dist = pd.to_numeric(df["Ride Distance"], errors="coerce")
_completed_dists = _dist[_dist > 0].dropna().values
np.random.seed(42)
_sampled = np.random.choice(_completed_dists, size=len(df), replace=True)
df["distance_km"] = np.where((_dist == 0) | _dist.isna(), _sampled, _dist.values)

# Target variable
df["is_cancelled"] = df["Booking Status"].apply(
    lambda x: 1 if "Cancelled" in str(x) else 0
)

# Map pickup locations to 25 constituency profiles
# Sort unique locations, split into 25 equal buckets, map to profiles sorted by rate
unique_locs = sorted(df["Pickup Location"].dropna().unique())
n_locs = len(unique_locs)
n_profiles = len(constituency_profiles)  # 25

loc_to_profile_idx = {}
for i, loc in enumerate(unique_locs):
    group_idx = min(int(i / n_locs * n_profiles), n_profiles - 1)
    loc_to_profile_idx[loc] = group_idx

df["_profile_idx"] = df["Pickup Location"].map(loc_to_profile_idx)
# Fallback: missing locations → median profile
fallback_idx = n_profiles // 2
df["_profile_idx"] = df["_profile_idx"].fillna(fallback_idx).astype(int)

# Apply constituency profile features row-by-row
for col in ["historical_cancel_rate", "metro_count_1km", "bus_stop_count_1km",
            "traffic_chokepoint_nearby", "is_flood_prone"]:
    df[col] = df["_profile_idx"].apply(lambda idx: constituency_profiles[idx][col])

print(f"\nClass distribution of is_cancelled:")
print(df["is_cancelled"].value_counts())
print(df["is_cancelled"].value_counts(normalize=True).apply(lambda x: f"{x:.2%}"))

print(f"\nDistinct historical_cancel_rate values in training data: {df['historical_cancel_rate'].nunique()}")
print("Values:", sorted(df["historical_cancel_rate"].unique()))

# ── STEP 4: Prepare features and target ───────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 4 — Preparing features and target")
print("=" * 60)

FEATURES = [
    "hour", "day_of_week", "month", "is_peak_hour", "is_weekend",
    "distance_km", "historical_cancel_rate", "metro_count_1km",
    "bus_stop_count_1km", "traffic_chokepoint_nearby", "is_flood_prone"
]

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
print(f"Train class counts before SMOTE: {dict(zip(*np.unique(y_train, return_counts=True)))}")

# SMOTE for class balancing (no scale_pos_weight)
smote = SMOTE(random_state=42)
X_train_res, y_train_res = smote.fit_resample(X_train, y_train)
print(f"Train class counts after SMOTE:  {dict(zip(*np.unique(y_train_res, return_counts=True)))}")

# ── STEP 7: Train XGBoost ──────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 7 — Training XGBoost with SMOTE-balanced data")
print("=" * 60)

model = XGBClassifier(
    n_estimators=300,
    max_depth=6,
    learning_rate=0.1,
    subsample=0.8,
    random_state=42,
    eval_metric="logloss",
)
model.fit(X_train_res, y_train_res)
print("Model trained successfully")

# ── STEP 8: Evaluate ──────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 8 — Evaluation")
print("=" * 60)

y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)
print(f"Accuracy: {accuracy:.4f}")
report = classification_report(y_test, y_pred, target_names=["Not Cancelled", "Cancelled"], output_dict=True)
print(classification_report(y_test, y_pred, target_names=["Not Cancelled", "Cancelled"]))

# Feature importances
importances = pd.Series(model.feature_importances_, index=FEATURES).sort_values(ascending=False)
print("Feature importances (highest to lowest):")
for feat, imp in importances.items():
    print(f"  {feat}: {imp:.4f}")

top3 = importances.head(3)

# Distinct historical_cancel_rate check
distinct_rates = df["historical_cancel_rate"].nunique()
print(f"\nDistinct historical_cancel_rate values in training data: {distinct_rates} (target: 25)")

# ── STEP 9 (user Step 6): Validation inputs ───────────────────────────────────
print("\n" + "=" * 60)
print("STEP 9 — Validation inputs")
print("=" * 60)

# Peak hour weekday high cancel zone (rate=0.75)
input1 = np.array([[9, 0, 4, 1, 0, 5.2, 0.75, 1, 12, 1, 0]])
# Off peak weekend low cancel zone (rate=0.54)
input2 = np.array([[14, 6, 4, 0, 1, 5.2, 0.54, 0, 3, 0, 0]])

input1_scaled = scaler.transform(input1)
input2_scaled = scaler.transform(input2)

prob1 = model.predict_proba(input1_scaled)[0][1]
prob2 = model.predict_proba(input2_scaled)[0][1]

def risk_level(prob):
    if prob >= 0.7:
        return "High"
    elif prob >= 0.5:
        return "Medium"
    else:
        return "Low"

print(f"\nInput 1 (peak hour, weekday, high-cancel zone, rate=0.75):")
print(f"  cancel_probability: {prob1:.4f}")
print(f"  risk_level:         {risk_level(prob1)}")

print(f"\nInput 2 (off-peak, weekend, low-cancel zone, rate=0.54):")
print(f"  cancel_probability: {prob2:.4f}")
print(f"  risk_level:         {risk_level(prob2)}")

diff = abs(prob1 - prob2)
print(f"\nDifference: {diff:.4f} (target > 0.10)")
validation_passed = accuracy > 0.65 and diff > 0.10
print(f"Validation: {'PASSED' if validation_passed else 'FAILED'}")

# ── STEP 10 (user Step 7): Conditional save and commit ────────────────────────
model_saved = False
if validation_passed:
    print("\n" + "=" * 60)
    print("STEP 10 — Saving model and committing")
    print("=" * 60)

    model_path = os.path.join(MODEL_OUT_DIR, "cancellation_model.pkl")
    joblib.dump(model, model_path)
    size_mb = os.path.getsize(model_path) / 1024 / 1024
    print(f"Model saved to {model_path} ({size_mb:.2f} MB)")
    print(f"Scaler already saved to {scaler_path}")

    features_path = os.path.join(MODEL_OUT_DIR, "feature_names.json")
    with open(features_path, "w") as f:
        json.dump(FEATURES, f)
    print(f"Feature names saved to {features_path}")

    # Git commit
    commit_msg = "Expand to 25 constituency profiles for better zone signal"
    try:
        subprocess.run(["git", "-C", BASE_DIR, "add",
                        "model_rebuild/retrain.py",
                        "backend/app/model/cancellation_model.pkl",
                        "backend/app/model/cancellation_scaler.pkl",
                        "backend/app/model/feature_names.json"],
                       check=True)
        subprocess.run(["git", "-C", BASE_DIR, "commit", "-m", commit_msg], check=True)
        print(f"Committed to ml-models branch: '{commit_msg}'")
        model_saved = True
    except subprocess.CalledProcessError as e:
        print(f"Git commit failed: {e}")
        model_saved = False
else:
    print("\nConditions not met — model NOT saved or committed.")
    print(f"  accuracy > 65%: {accuracy > 0.65} ({accuracy:.4%})")
    print(f"  diff > 0.10:    {diff > 0.10} ({diff:.4f})")

# ── STEP 11 (user Step 8): Final report ───────────────────────────────────────
cancelled_recall_after = report["Cancelled"]["recall"]
top3_str = ", ".join([f"{feat} ({imp:.4f})" for feat, imp in top3.items()])

print("\n" + "=" * 60)
print("=== OPTION 2 RETRAIN REPORT ===")
print("Distinct zone patterns before: 5")
print(f"Distinct zone patterns after:  {distinct_rates}")
print("Accuracy before: 67.46%")
print(f"Accuracy after:  {accuracy * 100:.2f}%")
print("Cancelled recall before: 12%")
print(f"Cancelled recall after:  {cancelled_recall_after * 100:.0f}%")
print(f"Top 3 feature importances: {top3_str}")
print(f"Validation input 1 cancel_probability: {prob1:.4f}")
print(f"Validation input 2 cancel_probability: {prob2:.4f}")
print(f"Difference: {diff:.4f} (target > 0.10)")
print(f"Validation: {'PASSED' if validation_passed else 'FAILED'}")
print(f"Model saved and committed: {'yes' if model_saved else 'no'}")
print("=== END REPORT ===")
