"""
CityNexus Data Preparation Script - Person 2
Prepares transport_layer.csv and area_context.csv from Hyderabad GIS and transport data
"""

import pandas as pd
import numpy as np
import json
import os
from math import radians, cos, sin, asin, sqrt

# ===========================
# HAVERSINE DISTANCE FUNCTION
# ===========================

def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance in kilometers between two points
    on the earth (specified in decimal degrees)
    """
    # Convert decimal degrees to radians
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])

    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))

    # Radius of earth in kilometers
    km = 6371 * c
    return km


# ===========================
# STEP 1: DATA CLEANING
# ===========================

print("=" * 60)
print("STEP 1: DATA CLEANING")
print("=" * 60)

# Define input and output directories
CLEANED_DATA_DIR = "cleaned_data"
OUTPUTS_DIR = "outputs"

# Create outputs directory if it doesn't exist
os.makedirs(OUTPUTS_DIR, exist_ok=True)

# Check if raw files exist, otherwise use cleaned files
raw_files = {
    'traffic_chokepoints': 'traffic_chokepoints.csv',
    'commercial_zones': 'commercial_zones.csv',
    'flood_vulnerable_zones': 'flood_vulnerable_zones.csv',
    'ward_boundaries': 'ward_boundaries.csv'
}

cleaned_files = {
    'traffic_chokepoints': 'traffic_chokepoints_clean.csv',
    'commercial_zones': 'commercial_zones_clean.csv',
    'flood_vulnerable_zones': 'flood_vulnerable_zones_clean.csv',
    'ward_boundaries': 'ward_boundaries_clean.csv'
}

# Traffic Chokepoints - Drop rows where latitude or longitude is null
print("\n1.1 Cleaning traffic_chokepoints.csv...")
if os.path.exists(os.path.join(CLEANED_DATA_DIR, raw_files['traffic_chokepoints'])):
    traffic_df = pd.read_csv(os.path.join(CLEANED_DATA_DIR, raw_files['traffic_chokepoints']))
    print(f"   Original rows: {len(traffic_df)}")
    traffic_df = traffic_df.dropna(subset=['latitude', 'longitude'])
    print(f"   After dropping null lat/lon: {len(traffic_df)}")
    traffic_df.to_csv(os.path.join(CLEANED_DATA_DIR, cleaned_files['traffic_chokepoints']), index=False)
    print(f"   Saved to {cleaned_files['traffic_chokepoints']}")
else:
    print(f"   Using existing {cleaned_files['traffic_chokepoints']}")
    traffic_df = pd.read_csv(os.path.join(CLEANED_DATA_DIR, cleaned_files['traffic_chokepoints']))

# Commercial Zones - Drop rows where lat/lon outside Hyderabad bounds
print("\n1.2 Cleaning commercial_zones.csv...")
if os.path.exists(os.path.join(CLEANED_DATA_DIR, raw_files['commercial_zones'])):
    commercial_df = pd.read_csv(os.path.join(CLEANED_DATA_DIR, raw_files['commercial_zones']))
    print(f"   Original rows: {len(commercial_df)}")
    # Keep rows with missing name/landuse/amenity, but filter by coordinates
    commercial_df = commercial_df[
        (commercial_df['latitude'].between(17.2, 17.7)) &
        (commercial_df['longitude'].between(78.2, 78.8))
    ]
    print(f"   After filtering coordinates (17.2-17.7 lat, 78.2-78.8 lon): {len(commercial_df)}")
    commercial_df.to_csv(os.path.join(CLEANED_DATA_DIR, cleaned_files['commercial_zones']), index=False)
    print(f"   Saved to {cleaned_files['commercial_zones']}")
else:
    print(f"   Using existing {cleaned_files['commercial_zones']}")
    commercial_df = pd.read_csv(os.path.join(CLEANED_DATA_DIR, cleaned_files['commercial_zones']))

# Flood Vulnerable Zones - Drop mandal column, duplicates, and specific row
print("\n1.3 Cleaning flood_vulnerable_zones.csv...")
if os.path.exists(os.path.join(CLEANED_DATA_DIR, raw_files['flood_vulnerable_zones'])):
    flood_df = pd.read_csv(os.path.join(CLEANED_DATA_DIR, raw_files['flood_vulnerable_zones']))
    print(f"   Original rows: {len(flood_df)}")

    # Drop mandal column if it exists
    if 'mandal' in flood_df.columns:
        flood_df = flood_df.drop(columns=['mandal'])
        print(f"   Dropped 'mandal' column")

    # Drop duplicates
    before_dup = len(flood_df)
    flood_df = flood_df.drop_duplicates()
    print(f"   After dropping duplicates: {len(flood_df)} (removed {before_dup - len(flood_df)} duplicates)")

    # Drop row with longitude 78.944463
    flood_df = flood_df[flood_df['longitude'] != 78.944463]
    print(f"   After dropping longitude 78.944463: {len(flood_df)}")

    # Fill missing families_affected with 0
    if 'families_affected' in flood_df.columns:
        flood_df['families_affected'] = flood_df['families_affected'].fillna(0)
        print(f"   Filled missing families_affected with 0")

    flood_df.to_csv(os.path.join(CLEANED_DATA_DIR, cleaned_files['flood_vulnerable_zones']), index=False)
    print(f"   Saved to {cleaned_files['flood_vulnerable_zones']}")
else:
    print(f"   Using existing {cleaned_files['flood_vulnerable_zones']}")
    flood_df = pd.read_csv(os.path.join(CLEANED_DATA_DIR, cleaned_files['flood_vulnerable_zones']))

# Ward Boundaries - Drop rows where ward_name is null
print("\n1.4 Cleaning ward_boundaries.csv...")
if os.path.exists(os.path.join(CLEANED_DATA_DIR, raw_files['ward_boundaries'])):
    ward_df = pd.read_csv(os.path.join(CLEANED_DATA_DIR, raw_files['ward_boundaries']))
    print(f"   Original rows: {len(ward_df)}")
    ward_df = ward_df.dropna(subset=['ward_name'])
    print(f"   After dropping null ward_name: {len(ward_df)}")
    ward_df.to_csv(os.path.join(CLEANED_DATA_DIR, cleaned_files['ward_boundaries']), index=False)
    print(f"   Saved to {cleaned_files['ward_boundaries']}")
else:
    print(f"   Using existing {cleaned_files['ward_boundaries']}")
    ward_df = pd.read_csv(os.path.join(CLEANED_DATA_DIR, cleaned_files['ward_boundaries']))

print("\nStep 1 Complete: All files cleaned ✓")


# ===========================
# STEP 2: BUILD TRANSPORT_LAYER.CSV
# ===========================

print("\n" + "=" * 60)
print("STEP 2: BUILD TRANSPORT_LAYER.CSV")
print("=" * 60)

# Load transport files
metro_df = pd.read_csv(os.path.join(CLEANED_DATA_DIR, 'metro_stations_clean.csv'))
bus_df = pd.read_csv(os.path.join(CLEANED_DATA_DIR, 'bus_stops_clean.csv'))
mmts_df = pd.read_csv(os.path.join(CLEANED_DATA_DIR, 'mmts_stops_clean.csv'))

print(f"\n2.1 Loading transport files...")
print(f"   Metro stations: {len(metro_df)} rows")
print(f"   Bus stops: {len(bus_df)} rows")
print(f"   MMTS stops: {len(mmts_df)} rows")

# Select only required columns from each
required_cols = ['name', 'latitude', 'longitude', 'zone_type']

metro_subset = metro_df[required_cols].copy()
bus_subset = bus_df[required_cols].copy()
mmts_subset = mmts_df[required_cols].copy()

# Stack all three into one dataframe
transport_layer = pd.concat([metro_subset, bus_subset, mmts_subset], ignore_index=True)

print(f"\n2.2 Combined transport data: {len(transport_layer)} rows")

# Save to outputs
transport_output_path = os.path.join(OUTPUTS_DIR, 'transport_layer.csv')
transport_layer.to_csv(transport_output_path, index=False)

print(f"   Saved to {transport_output_path} ✓")


# ===========================
# STEP 3: BUILD AREA_CONTEXT.CSV
# ===========================

print("\n" + "=" * 60)
print("STEP 3: BUILD AREA_CONTEXT.CSV")
print("=" * 60)

# Load cleaned ward boundaries
ward_boundaries = pd.read_csv(os.path.join(CLEANED_DATA_DIR, cleaned_files['ward_boundaries']))

print(f"\n3.1 Starting with ward boundaries: {len(ward_boundaries)} wards")

# Load all necessary point data
traffic_points = pd.read_csv(os.path.join(CLEANED_DATA_DIR, cleaned_files['traffic_chokepoints']))
flood_points = pd.read_csv(os.path.join(CLEANED_DATA_DIR, cleaned_files['flood_vulnerable_zones']))
police_points = pd.read_csv(os.path.join(CLEANED_DATA_DIR, 'police_stations_clean.csv'))
commercial_points = pd.read_csv(os.path.join(CLEANED_DATA_DIR, cleaned_files['commercial_zones']))

print(f"\n3.2 Loaded context data:")
print(f"   Traffic chokepoints: {len(traffic_points)} points")
print(f"   Flood zones: {len(flood_points)} points")
print(f"   Police stations: {len(police_points)} points")
print(f"   Commercial zones: {len(commercial_points)} points")

# Compute ward centers using all available point data
print("\n3.3 Computing ward centers...")

# Combine all point data to estimate ward centers
all_points = pd.concat([
    traffic_points[['latitude', 'longitude']],
    flood_points[['latitude', 'longitude']],
    police_points[['latitude', 'longitude']],
    commercial_points[['latitude', 'longitude']],
    metro_df[['latitude', 'longitude']],
    bus_df[['latitude', 'longitude']],
    mmts_df[['latitude', 'longitude']]
], ignore_index=True)

# For simplicity, we'll use Hyderabad's approximate center for all wards
# In a production system, you'd map wards to their actual geographic centers
# Using a fallback approach: approximate ward centers based on Hyderabad geography

# Hardcoded approximate Hyderabad ward centroids (fallback)
# Since we don't have ward polygons, we'll use the overall Hyderabad center
hyderabad_center_lat = 17.385
hyderabad_center_lon = 78.486

# Calculate mean position of all points as Hyderabad center
if len(all_points) > 0:
    hyderabad_center_lat = all_points['latitude'].mean()
    hyderabad_center_lon = all_points['longitude'].mean()

print(f"   Using Hyderabad approximate center: ({hyderabad_center_lat:.4f}, {hyderabad_center_lon:.4f})")

# For each ward, we'll use the Hyderabad center as approximation
# In a real scenario, you'd have ward polygon data to compute actual centroids
ward_boundaries['center_lat'] = hyderabad_center_lat
ward_boundaries['center_lon'] = hyderabad_center_lon

# Alternative: Try to distribute ward centers in a grid pattern
# This is a rough approximation for demonstration
n_wards = len(ward_boundaries)
grid_size = int(np.ceil(np.sqrt(n_wards)))

# Create a grid of points around Hyderabad center
lat_offset = np.linspace(-0.15, 0.15, grid_size)
lon_offset = np.linspace(-0.15, 0.15, grid_size)

ward_centers = []
for i in range(n_wards):
    grid_row = i // grid_size
    grid_col = i % grid_size
    if grid_row < len(lat_offset) and grid_col < len(lon_offset):
        lat = hyderabad_center_lat + lat_offset[grid_row]
        lon = hyderabad_center_lon + lon_offset[grid_col]
        ward_centers.append((lat, lon))
    else:
        ward_centers.append((hyderabad_center_lat, hyderabad_center_lon))

ward_boundaries['center_lat'] = [w[0] for w in ward_centers]
ward_boundaries['center_lon'] = [w[1] for w in ward_centers]

print(f"   Ward centers computed using grid approximation")

# Now compute features for each ward
print("\n3.4 Computing ward features...")

# Initialize feature columns
ward_boundaries['chokepoint_count'] = 0
ward_boundaries['is_flood_prone'] = 0
ward_boundaries['nearest_police_distance_km'] = np.nan
ward_boundaries['commercial_density'] = 0

# Compute features for each ward
for idx, ward in ward_boundaries.iterrows():
    ward_lat = ward['center_lat']
    ward_lon = ward['center_lon']

    # Feature 1: chokepoint_count (within 2km)
    chokepoint_count = 0
    for _, point in traffic_points.iterrows():
        dist = haversine_distance(ward_lat, ward_lon, point['latitude'], point['longitude'])
        if dist <= 2.0:
            chokepoint_count += 1
    ward_boundaries.at[idx, 'chokepoint_count'] = chokepoint_count

    # Feature 2: is_flood_prone (1 if any flood zone within 2km)
    is_flood_prone = 0
    for _, point in flood_points.iterrows():
        dist = haversine_distance(ward_lat, ward_lon, point['latitude'], point['longitude'])
        if dist <= 2.0:
            is_flood_prone = 1
            break
    ward_boundaries.at[idx, 'is_flood_prone'] = is_flood_prone

    # Feature 3: nearest_police_distance_km
    min_distance = float('inf')
    for _, point in police_points.iterrows():
        dist = haversine_distance(ward_lat, ward_lon, point['latitude'], point['longitude'])
        if dist < min_distance:
            min_distance = dist
    ward_boundaries.at[idx, 'nearest_police_distance_km'] = min_distance if min_distance != float('inf') else np.nan

    # Feature 4: commercial_density (within 1km)
    commercial_count = 0
    for _, point in commercial_points.iterrows():
        dist = haversine_distance(ward_lat, ward_lon, point['latitude'], point['longitude'])
        if dist <= 1.0:
            commercial_count += 1
    ward_boundaries.at[idx, 'commercial_density'] = commercial_count

print(f"   Computed: chokepoint_count, is_flood_prone, nearest_police_distance_km, commercial_density")

# Match constituency data
print("\n3.5 Matching constituency funnel data...")

# Load constituency funnel data
with open(os.path.join(CLEANED_DATA_DIR, 'HYDERABAD_constituency_funnel.json'), 'r') as f:
    constituency_data = json.load(f)

# Convert to dataframe for easier matching
constituency_df = pd.DataFrame(constituency_data)

# Add constituency columns
ward_boundaries['cancellation_rate'] = np.nan
ward_boundaries['avg_fare'] = np.nan
ward_boundaries['driver_acceptance_rate'] = np.nan

# Extract constituency number from ward_name if available
# Ward names might have patterns like "127-RANGAREDDY NAGAR"
# We'll try to match based on constituency number in the data

# Create a mapping from ac_num to constituency metrics
constituency_map = {}
for _, row in constituency_df.iterrows():
    ac_num = str(row['ac_num'])
    constituency_map[ac_num] = {
        'cancellation_rate': row['bkng_cancel_rate'],
        'avg_fare': row['avg_fare'],
        'driver_acceptance_rate': row['q_accept_rate']
    }

# Try to match wards to constituencies
# Since we don't have a direct mapping, we'll use a simple approach:
# Extract any number from ward_name and try to match it to ac_num

matched_count = 0
for idx, ward in ward_boundaries.iterrows():
    ward_name = str(ward['ward_name'])
    # Try to extract number from ward name
    import re
    numbers = re.findall(r'\d+', ward_name)

    if numbers:
        # Try the first number found
        potential_ac = numbers[0]
        if potential_ac in constituency_map:
            ward_boundaries.at[idx, 'cancellation_rate'] = constituency_map[potential_ac]['cancellation_rate']
            ward_boundaries.at[idx, 'avg_fare'] = constituency_map[potential_ac]['avg_fare']
            ward_boundaries.at[idx, 'driver_acceptance_rate'] = constituency_map[potential_ac]['driver_acceptance_rate']
            matched_count += 1

print(f"   Matched {matched_count} wards to constituency data")
print(f"   {len(ward_boundaries) - matched_count} wards left with null constituency metrics (as expected)")

# Select final columns for area_context.csv
area_context = ward_boundaries[[
    'ward_name', 'circle', 'zone', 'area_sqkm',
    'chokepoint_count', 'is_flood_prone', 'nearest_police_distance_km', 'commercial_density',
    'cancellation_rate', 'avg_fare', 'driver_acceptance_rate'
]].copy()

# Save to outputs
area_context_path = os.path.join(OUTPUTS_DIR, 'area_context.csv')
area_context.to_csv(area_context_path, index=False)

print(f"\n   Saved to {area_context_path} ✓")


# ===========================
# STEP 4: VALIDATION
# ===========================

print("\n" + "=" * 60)
print("STEP 4: VALIDATION")
print("=" * 60)

# Reload the output files for validation
transport_layer_check = pd.read_csv(transport_output_path)
area_context_check = pd.read_csv(area_context_path)

print("\n4.1 TRANSPORT_LAYER.CSV Validation")
print(f"   Shape: {transport_layer_check.shape}")
print(f"   Unique zone_types: {transport_layer_check['zone_type'].nunique()}")
print(f"   Zone types: {sorted(transport_layer_check['zone_type'].unique())}")
print(f"   Nulls in latitude: {transport_layer_check['latitude'].isna().sum()}")
print(f"   Nulls in longitude: {transport_layer_check['longitude'].isna().sum()}")

print("\n   First 5 rows:")
print(transport_layer_check.head())

print("\n4.2 AREA_CONTEXT.CSV Validation")
print(f"   Shape: {area_context_check.shape}")
print(f"   Expected: 150 rows (got {len(area_context_check)} rows)")

print("\n   Summary statistics for key features:")
print(f"   chokepoint_count: min={area_context_check['chokepoint_count'].min()}, "
      f"max={area_context_check['chokepoint_count'].max()}, "
      f"mean={area_context_check['chokepoint_count'].mean():.2f}")
print(f"   commercial_density: min={area_context_check['commercial_density'].min()}, "
      f"max={area_context_check['commercial_density'].max()}, "
      f"mean={area_context_check['commercial_density'].mean():.2f}")
print(f"   nearest_police_distance_km: min={area_context_check['nearest_police_distance_km'].min():.2f}, "
      f"max={area_context_check['nearest_police_distance_km'].max():.2f}, "
      f"mean={area_context_check['nearest_police_distance_km'].mean():.2f}")

print("\n   First 5 rows:")
print(area_context_check.head())

print("\n" + "=" * 60)
print("ALL STEPS COMPLETE ✓")
print("=" * 60)
print(f"\nOutput files saved to '{OUTPUTS_DIR}/' directory:")
print(f"  - transport_layer.csv ({len(transport_layer_check)} rows)")
print(f"  - area_context.csv ({len(area_context_check)} rows)")
print("\n")
