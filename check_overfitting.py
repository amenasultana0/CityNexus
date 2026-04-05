import joblib
import pandas as pd
from sklearn.model_selection import cross_val_score

print("=" * 60)
print("CityNexus Model Overfitting Check")
print("=" * 60)

# Load the trained model
print("\n[1/4] Loading trained model...")
model = joblib.load('model_outputs/cancellation_model.pkl')
print("✓ Model loaded successfully")

# Load training data
print("\n[2/4] Loading training data...")
X_train = pd.read_csv('model_inputs/X_train_final.csv')
y_train = pd.read_csv('model_inputs/y_train_final.csv')

# Drop Source_encoded column if it exists
if 'Source_encoded' in X_train.columns:
    print("✓ Dropping Source_encoded column")
    X_train = X_train.drop('Source_encoded', axis=1)

# Flatten y_train if it's a DataFrame
if isinstance(y_train, pd.DataFrame):
    y_train = y_train.values.ravel()

print(f"✓ Training data loaded: {X_train.shape[0]} samples, {X_train.shape[1]} features")

# Run 5-fold cross validation
print("\n[3/4] Running 5-fold cross-validation...")
scores = cross_val_score(model, X_train, y_train, cv=5, scoring='accuracy')
print(f"Cross-validation scores: {scores}")
print(f"Mean CV accuracy: {scores.mean():.4f}")
print(f"Standard deviation: {scores.std():.4f}")

# Interpret results
print("\n[4/4] Interpreting results...")
print("=" * 60)

mean_cv = scores.mean()
std_cv = scores.std()
test_accuracy = 0.8885  # Reference test accuracy

# Apply interpretation rules
if 0.85 <= mean_cv <= 0.92 and std_cv < 0.02:
    print("✓ NO OVERFITTING DETECTED — model is stable and generalises well")
    status = "HEALTHY"
elif mean_cv < 0.80 and test_accuracy == 0.8885:
    print("⚠ OVERFITTING DETECTED — model memorised training data")
    status = "OVERFITTED"
else:
    status = "NEEDS_REVIEW"

if std_cv > 0.03:
    print("⚠ MODEL IS UNSTABLE — results vary too much across folds")
    if status == "HEALTHY":
        status = "UNSTABLE"

if abs(mean_cv - test_accuracy) <= 0.03:
    print("✓ MODEL IS CONSISTENT — cross validation matches test accuracy")
    if status == "NEEDS_REVIEW":
        status = "CONSISTENT"

print("=" * 60)

# Plain English summary
print("\n📊 SUMMARY FOR CITYNEXUS PROJECT")
print("=" * 60)

if status == "HEALTHY":
    print("""
Your XGBoost cancellation prediction model is performing excellently.
The cross-validation results show that the model generalizes well to
unseen data and maintains stable predictions across different data splits.

This means:
• The model hasn't memorized specific patterns from the training data
• It will likely perform reliably on real-world CityNexus booking data
• You can confidently deploy this model to predict ride cancellations

Next steps: Consider testing on a holdout validation set to further
confirm performance before production deployment.
""")
elif status == "OVERFITTED":
    print("""
⚠ Warning: Your model shows signs of overfitting.

The cross-validation accuracy is significantly lower than the test accuracy
(88.85%), which suggests the model has memorized patterns specific to the
training data rather than learning generalizable patterns.

This means:
• The model may not perform well on new, unseen CityNexus booking data
• Predictions on real-world data could be unreliable

Recommended actions:
1. Reduce model complexity (lower max_depth, increase min_child_weight)
2. Add regularization (increase reg_alpha or reg_lambda)
3. Collect more diverse training data
4. Consider feature engineering to create more meaningful predictors
""")
elif status == "UNSTABLE":
    print("""
⚠ Warning: Your model shows high variance across folds.

The standard deviation is high, meaning the model's performance varies
significantly depending on which data it's trained on.

This means:
• Model reliability is uncertain for CityNexus predictions
• Performance may fluctuate on different subsets of booking data

Recommended actions:
1. Increase training data size for more stable learning
2. Review feature quality - some features may be noisy or irrelevant
3. Try ensemble methods or adjust XGBoost parameters
4. Check for data quality issues or outliers
""")
elif status == "CONSISTENT":
    print("""
✓ Your model shows consistency between cross-validation and test results.

The cross-validation accuracy closely matches your reported test accuracy
of 88.85%, which is a positive sign that the model is stable.

This means:
• The test set performance wasn't just luck
• The model should generalize reasonably well to new data

However, review other metrics (precision, recall, F1-score) for CityNexus
cancellation predictions to ensure the model meets business requirements.
""")
else:
    print(f"""
Your model achieved {mean_cv*100:.2f}% accuracy with {std_cv:.4f} standard deviation.

Please review the specific metrics above to determine if the model meets
your requirements for predicting ride cancellations in CityNexus.

Consider comparing these results with your test accuracy (88.85%) and
evaluate if the model is suitable for production deployment.
""")

print("=" * 60)
