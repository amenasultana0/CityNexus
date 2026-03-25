import pandas as pd
import numpy as np
import os

# Track issues found
issues = {
    'transport_layer.csv': [],
    'area_context.csv': [],
    'Calibration_HYDERABAD_constituency_funnel.csv': [],
    'demand_patterns.csv': []
}

def check_null_percentage(df, threshold=0.5):
    """Return columns that are more than threshold% null"""
    null_pct = df.isnull().sum() / len(df)
    return null_pct[null_pct > threshold].to_dict()

print("=" * 80)
print("CITYNEXUS OUTPUT FILES VERIFICATION")
print("=" * 80)

# ============================================================================
# 1. TRANSPORT_LAYER.CSV
# ============================================================================
print("\n" + "=" * 80)
print("=== CHECKING transport_layer.csv ===")
print("=" * 80)

file_path = 'outputs/transport_layer.csv'
if not os.path.exists(file_path):
    issues['transport_layer.csv'].append(f"❌ File not found: {file_path}")
    print(f"❌ File not found: {file_path}")
else:
    df = pd.read_csv(file_path)

    # Shape
    print(f"\n📊 Shape: {df.shape}")
    print(f"   Rows: {df.shape[0]}, Columns: {df.shape[1]}")

    # Check zone_type has exactly 3 unique values
    print(f"\n🔍 Checking zone_type column...")
    if 'zone_type' not in df.columns:
        issues['transport_layer.csv'].append("❌ zone_type column missing")
        print("   ❌ zone_type column missing")
    else:
        unique_zone_types = df['zone_type'].nunique()
        print(f"   Unique zone_type values: {unique_zone_types}")
        print(f"   Values: {df['zone_type'].unique().tolist()}")
        if unique_zone_types == 3:
            print("   ✅ Exactly 3 unique values")
        else:
            issues['transport_layer.csv'].append(f"❌ Expected 3 unique zone_type values, found {unique_zone_types}")
            print(f"   ❌ Expected 3, found {unique_zone_types}")

    # Check latitude and longitude for nulls
    print(f"\n🔍 Checking latitude and longitude for nulls...")
    for col in ['latitude', 'longitude']:
        if col not in df.columns:
            issues['transport_layer.csv'].append(f"❌ {col} column missing")
            print(f"   ❌ {col} column missing")
        else:
            null_count = df[col].isnull().sum()
            if null_count == 0:
                print(f"   ✅ {col}: No nulls")
            else:
                issues['transport_layer.csv'].append(f"❌ {col} has {null_count} nulls")
                print(f"   ❌ {col}: {null_count} nulls found")

    # First 5 rows
    print(f"\n📋 First 5 rows:")
    print(df.head())

# ============================================================================
# 2. AREA_CONTEXT.CSV
# ============================================================================
print("\n" + "=" * 80)
print("=== CHECKING area_context.csv ===")
print("=" * 80)

file_path = 'outputs/area_context.csv'
if not os.path.exists(file_path):
    issues['area_context.csv'].append(f"❌ File not found: {file_path}")
    print(f"❌ File not found: {file_path}")
else:
    df = pd.read_csv(file_path)

    # Shape
    print(f"\n📊 Shape: {df.shape}")
    print(f"   Rows: {df.shape[0]}, Columns: {df.shape[1]}")

    # Check for exactly 150 rows
    print(f"\n🔍 Checking row count...")
    if df.shape[0] == 150:
        print(f"   ✅ Exactly 150 rows")
    else:
        issues['area_context.csv'].append(f"❌ Expected 150 rows, found {df.shape[0]}")
        print(f"   ❌ Expected 150 rows, found {df.shape[0]}")

    # Columns
    print(f"\n📋 Columns ({len(df.columns)}):")
    for i, col in enumerate(df.columns, 1):
        print(f"   {i}. {col}")

    # First 5 rows
    print(f"\n📋 First 5 rows:")
    print(df.head())

    # Summary stats for specific columns
    print(f"\n📈 Summary statistics for key columns:")
    key_cols = ['chokepoint_count', 'commercial_density', 'nearest_police_distance_km']
    for col in key_cols:
        if col in df.columns:
            print(f"\n   {col}:")
            print(f"      Mean:   {df[col].mean():.4f}")
            print(f"      Min:    {df[col].min():.4f}")
            print(f"      Max:    {df[col].max():.4f}")
            print(f"      Nulls:  {df[col].isnull().sum()}")
        else:
            issues['area_context.csv'].append(f"❌ Expected column '{col}' not found")
            print(f"\n   ❌ {col}: Column not found")

    # Check for columns >50% null
    print(f"\n🔍 Checking for columns with >50% null values...")
    high_null_cols = check_null_percentage(df, threshold=0.5)
    if high_null_cols:
        for col, pct in high_null_cols.items():
            issues['area_context.csv'].append(f"⚠️  Column '{col}' is {pct*100:.1f}% null")
            print(f"   ⚠️  {col}: {pct*100:.1f}% null")
    else:
        print(f"   ✅ No columns with >50% nulls")

# ============================================================================
# 3. CALIBRATION_HYDERABAD_CONSTITUENCY_FUNNEL.CSV
# ============================================================================
print("\n" + "=" * 80)
print("=== CHECKING Calibration_HYDERABAD_constituency_funnel.csv ===")
print("=" * 80)

file_path = 'outputs/Calibration_HYDERABAD_constituency_funnel.csv'
if not os.path.exists(file_path):
    issues['Calibration_HYDERABAD_constituency_funnel.csv'].append(f"❌ File not found: {file_path}")
    print(f"❌ File not found: {file_path}")
else:
    df = pd.read_csv(file_path)

    # Shape
    print(f"\n📊 Shape: {df.shape}")
    print(f"   Rows: {df.shape[0]}, Columns: {df.shape[1]}")

    # All column names
    print(f"\n📋 All columns ({len(df.columns)}):")
    for i, col in enumerate(df.columns, 1):
        print(f"   {i}. {col}")

    # First 5 rows
    print(f"\n📋 First 5 rows:")
    print(df.head())

    # Check for required columns
    print(f"\n🔍 Checking for required columns...")
    required_cols = ['cancellation_rate', 'avg_fare', 'driver_acceptance_rate']
    for col in required_cols:
        if col in df.columns:
            print(f"   ✅ {col}: Found")
        else:
            issues['Calibration_HYDERABAD_constituency_funnel.csv'].append(f"❌ Required column '{col}' not found")
            print(f"   ❌ {col}: Not found")

    # Statistics for rate columns
    print(f"\n📈 Statistics for key metrics:")
    for col in required_cols:
        if col in df.columns:
            print(f"\n   {col}:")
            print(f"      Min:    {df[col].min():.4f}")
            print(f"      Max:    {df[col].max():.4f}")
            print(f"      Mean:   {df[col].mean():.4f}")
            print(f"      Nulls:  {df[col].isnull().sum()}")

            # Flag issues
            if df[col].min() < 0:
                issues['Calibration_HYDERABAD_constituency_funnel.csv'].append(
                    f"⚠️  {col} has negative values (min: {df[col].min():.4f})"
                )
                print(f"      ⚠️  WARNING: Negative values found!")

            if 'rate' in col.lower() and df[col].max() > 1:
                issues['Calibration_HYDERABAD_constituency_funnel.csv'].append(
                    f"⚠️  {col} has values >1 (max: {df[col].max():.4f})"
                )
                print(f"      ⚠️  WARNING: Rate exceeds 1.0!")

            if df[col].isnull().sum() > 0:
                issues['Calibration_HYDERABAD_constituency_funnel.csv'].append(
                    f"⚠️  {col} has {df[col].isnull().sum()} null values"
                )
                print(f"      ⚠️  WARNING: Contains nulls!")

# ============================================================================
# 4. DEMAND_PATTERNS.CSV (NEWLY CREATED)
# ============================================================================
print("\n" + "=" * 80)
print("=== CHECKING demand_patterns.csv ===")
print("=" * 80)

file_path = 'outputs/demand_patterns.csv'
if not os.path.exists(file_path):
    issues['demand_patterns.csv'].append(f"❌ File not found: {file_path}")
    print(f"❌ File not found: {file_path}")
else:
    df = pd.read_csv(file_path)

    # Shape
    print(f"\n📊 Shape: {df.shape}")
    print(f"   Rows: {df.shape[0]}, Columns: {df.shape[1]}")

    # All column names
    print(f"\n📋 All columns ({len(df.columns)}):")
    for i, col in enumerate(df.columns, 1):
        print(f"   {i}. {col}")

    # First 5 rows
    print(f"\n📋 First 5 rows:")
    print(df.head())

    # Check for completely empty columns
    print(f"\n🔍 Checking for completely empty columns...")
    empty_cols = df.columns[df.isnull().all()].tolist()
    if empty_cols:
        issues['demand_patterns.csv'].append(f"⚠️  Completely empty columns: {empty_cols}")
        print(f"   ⚠️  Found {len(empty_cols)} completely empty columns: {empty_cols}")
    else:
        print(f"   ✅ No completely empty columns")

    # Check for date column and show date range
    print(f"\n🔍 Checking for date information...")
    if 'date' in df.columns:
        print(f"   ✅ Date column found")
        # Try to parse dates
        try:
            df['date_parsed'] = pd.to_datetime(df['date'])
            min_date = df['date_parsed'].min()
            max_date = df['date_parsed'].max()
            unique_dates = df['date_parsed'].nunique()
            print(f"   📅 Date range:")
            print(f"      From: {min_date.date()}")
            print(f"      To:   {max_date.date()}")
            print(f"      Span: {(max_date - min_date).days} days")
            print(f"      Unique dates: {unique_dates}")
        except Exception as e:
            issues['demand_patterns.csv'].append(f"⚠️  Could not parse date column: {str(e)}")
            print(f"   ⚠️  Could not parse dates: {str(e)}")
    else:
        issues['demand_patterns.csv'].append("❌ No 'date' column found")
        print(f"   ❌ No 'date' column found")

    # Check granularity column
    if 'granularity' in df.columns:
        print(f"\n   📊 Granularity breakdown:")
        print(df['granularity'].value_counts())

# ============================================================================
# FINAL SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("VERIFICATION SUMMARY")
print("=" * 80)

all_passed = True
for filename, file_issues in issues.items():
    if file_issues:
        all_passed = False
        print(f"\n❌ {filename}: {len(file_issues)} issue(s)")
        for issue in file_issues:
            print(f"   {issue}")
    else:
        print(f"\n✅ {filename}: All checks passed")

if all_passed:
    print("\n" + "=" * 80)
    print("🎉 ALL FILES PASSED VERIFICATION!")
    print("=" * 80)
else:
    print("\n" + "=" * 80)
    print("⚠️  SOME ISSUES FOUND - REVIEW ABOVE")
    print("=" * 80)
