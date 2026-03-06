import pandas as pd
import json

# Hyderabad coordinate bounds for validation
LAT_MIN, LAT_MAX = 17.2, 17.7
LON_MIN, LON_MAX = 78.2, 78.8

def explore_csv(filepath, name):
    print(f"\n{'='*80}")
    print(f"EXPLORING: {name}")
    print(f"{'='*80}")

    df = pd.read_csv(filepath)

    print(f"\nShape: {df.shape}")
    print(f"\nColumns: {df.columns.tolist()}")
    print(f"\nData types:\n{df.dtypes}")
    print(f"\nMissing values:\n{df.isnull().sum()}")
    print(f"\nDuplicate rows: {df.duplicated().sum()}")

    print(f"\nFirst 5 rows:")
    print(df.head())

    # Check for coordinate columns and validate bounds
    lat_cols = [col for col in df.columns if 'lat' in col.lower()]
    lon_cols = [col for col in df.columns if 'lon' in col.lower()]

    if lat_cols and lon_cols:
        lat_col = lat_cols[0]
        lon_col = lon_cols[0]

        print(f"\n--- Coordinate Validation ---")
        print(f"Latitude stats ({lat_col}):")
        print(df[lat_col].describe())

        print(f"\nLongitude stats ({lon_col}):")
        print(df[lon_col].describe())

        # Check for outliers
        lat_outliers = df[(df[lat_col] < LAT_MIN) | (df[lat_col] > LAT_MAX)]
        lon_outliers = df[(df[lon_col] < LON_MIN) | (df[lon_col] > LON_MAX)]

        print(f"\nLatitude outliers (outside {LAT_MIN}-{LAT_MAX}): {len(lat_outliers)}")
        if len(lat_outliers) > 0:
            print(lat_outliers[[col for col in df.columns if col in ['name', lat_col, lon_col]]].head())

        print(f"\nLongitude outliers (outside {LON_MIN}-{LON_MAX}): {len(lon_outliers)}")
        if len(lon_outliers) > 0:
            print(lon_outliers[[col for col in df.columns if col in ['name', lat_col, lon_col]]].head())

    # Show unique values for categorical columns
    for col in df.select_dtypes(include='object').columns:
        unique_count = df[col].nunique()
        if unique_count < 20:
            print(f"\nUnique values in '{col}' ({unique_count}): {df[col].unique().tolist()}")

    return df

# Explore all CSV files
print("Starting exploration of all Hyderabad datasets...")

metro = explore_csv('raw_data/metro_stations.csv', 'Metro Stations')
mmts = explore_csv('raw_data/mmts_stops.csv', 'MMTS Stops')
traffic = explore_csv('raw_data/traffic_chokepoints.csv', 'Traffic Chokepoints')
police = explore_csv('raw_data/police_stations.csv', 'Police Stations')
commercial = explore_csv('raw_data/commercial_zones.csv', 'Commercial Zones')
flood = explore_csv('raw_data/flood_vulnerable_zones.csv', 'Flood Vulnerable Zones')
wards = explore_csv('raw_data/ward_boundaries.csv', 'Ward Boundaries')

# Explore JSON file
print(f"\n{'='*80}")
print(f"EXPLORING: YAARY Hyderabad Reviews (JSON)")
print(f"{'='*80}")

with open('raw_data/YAARY_Hyderabad_reviews.json', 'r') as f:
    reviews = json.load(f)

print(f"\nTotal reviews: {len(reviews)}")
print(f"\nFirst review sample:")
print(json.dumps(reviews[0], indent=2))

if len(reviews) > 0:
    # Check structure
    print(f"\nKeys in first review: {list(reviews[0].keys())}")

    # Check for nulls in key fields
    null_counts = {}
    for key in reviews[0].keys():
        null_count = sum(1 for r in reviews if r.get(key) is None or r.get(key) == '')
        null_counts[key] = null_count

    print(f"\nNull/empty counts by field:")
    for k, v in null_counts.items():
        print(f"  {k}: {v}")

print(f"\n{'='*80}")
print("EXPLORATION COMPLETE")
print(f"{'='*80}")
