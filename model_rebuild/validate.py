"""
CityNexus Cancellation Model — validate.py
Confirms the saved model and scaler produce varying predictions for different inputs.
Run from the CityNexus/ root directory:
    python3 model_rebuild/validate.py
"""

import os
import joblib
import json
import numpy as np

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.path.join(BASE_DIR, "backend", "app", "model")

model  = joblib.load(os.path.join(MODEL_DIR, "cancellation_model.pkl"))
scaler = joblib.load(os.path.join(MODEL_DIR, "cancellation_scaler.pkl"))

with open(os.path.join(MODEL_DIR, "feature_names.json")) as f:
    features = json.load(f)

print("Features:", features)

# Input 1 — peak hour weekday high cancellation zone
input1 = np.array([[9, 0, 4, 1, 0, 5.2, 0.65, 1, 8, 1, 0]])
# Input 2 — off peak weekend low cancellation zone
input2 = np.array([[14, 6, 4, 0, 1, 5.2, 0.55, 2, 5, 0, 0]])

pred1 = model.predict_proba(scaler.transform(input1))[0]
pred2 = model.predict_proba(scaler.transform(input2))[0]

print("\nPeak hour weekday high zone:", pred1)
print("Off peak weekend low zone:  ", pred2)
print(f"\nCancellation probability — Input1: {pred1[1]:.4f}, Input2: {pred2[1]:.4f}")
print(f"Difference: {abs(pred1[1] - pred2[1]):.4f}")

if abs(pred1[1] - pred2[1]) > 0.05:
    print("\nVALIDATION PASSED — model produces different outputs for different inputs")
else:
    print("\nVALIDATION FAILED — model outputs are too similar, something is still wrong")
