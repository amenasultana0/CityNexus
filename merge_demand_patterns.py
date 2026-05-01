import pandas as pd
import os

print("=" * 80)
print("MERGING DEMAND PATTERNS FILES")
print("=" * 80)

# Read both files
daily_file = 'cleaned_data/demand_patterns_daily.csv'
hourly_file = 'cleaned_data/demand_patterns_hourly.csv'

print(f"\n📂 Reading {daily_file}...")
df_daily = pd.read_csv(daily_file)

print(f"\n📂 Reading {hourly_file}...")
df_hourly = pd.read_csv(hourly_file)

# Print inspection for daily file
print("\n" + "=" * 80)
print("DAILY FILE INSPECTION")
print("=" * 80)
print(f"\nColumns ({len(df_daily.columns)}):")
print(df_daily.columns.tolist())
print(f"\nShape: {df_daily.shape}")
print("\nFirst 5 rows:")
print(df_daily.head())

# Print inspection for hourly file
print("\n" + "=" * 80)
print("HOURLY FILE INSPECTION")
print("=" * 80)
print(f"\nColumns ({len(df_hourly.columns)}):")
print(df_hourly.columns.tolist())
print(f"\nShape: {df_hourly.shape}")
print("\nFirst 5 rows:")
print(df_hourly.head())

# Decide on merge strategy
print("\n" + "=" * 80)
print("MERGE STRATEGY")
print("=" * 80)

common_cols = set(df_daily.columns) & set(df_hourly.columns)
daily_only = set(df_daily.columns) - set(df_hourly.columns)
hourly_only = set(df_hourly.columns) - set(df_daily.columns)

print(f"\nCommon columns ({len(common_cols)}): {sorted(common_cols)}")
print(f"\nDaily-only columns ({len(daily_only)}): {sorted(daily_only)}")
print(f"\nHourly-only columns ({len(hourly_only)}): {sorted(hourly_only)}")

print("\n⚙️  Since these files have different granularities (daily vs hourly)")
print("   and different column sets, I'll stack them vertically with a")
print("   'granularity' column to distinguish the source.")

# Add granularity column
df_daily['granularity'] = 'daily'
df_hourly['granularity'] = 'hourly'

# Get all unique columns
all_columns = sorted(set(df_daily.columns) | set(df_hourly.columns))

# Reindex both dataframes to have all columns
df_daily = df_daily.reindex(columns=all_columns)
df_hourly = df_hourly.reindex(columns=all_columns)

# Concatenate
df_merged = pd.concat([df_daily, df_hourly], ignore_index=True)

print(f"\n✅ Merged dataframe shape: {df_merged.shape}")
print(f"   - Daily rows: {len(df_daily)}")
print(f"   - Hourly rows: {len(df_hourly)}")
print(f"   - Total rows: {len(df_merged)}")
print(f"   - Total columns: {len(df_merged.columns)}")

# Create outputs directory if it doesn't exist
os.makedirs('outputs', exist_ok=True)

# Save merged file
output_file = 'outputs/demand_patterns.csv'
df_merged.to_csv(output_file, index=False)

print(f"\n💾 Saved merged file to: {output_file}")
print("\nFirst 5 rows of merged file:")
print(df_merged.head())

print("\n" + "=" * 80)
print("✅ MERGE COMPLETE")
print("=" * 80)
