import pandas as pd
import numpy as np
from math import radians, sin, cos, sqrt, atan2

# Haversine distance function (in km)
def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371  # Earth radius in km

    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))

    return R * c

# Count POIs within radius
def count_within_radius(zone_lat, zone_lon, poi_df, radius_km):
    count = 0
    for _, poi in poi_df.iterrows():
        dist = haversine_distance(zone_lat, zone_lon, poi['latitude'], poi['longitude'])
        if dist <= radius_km:
            count += 1
    return count

# Find nearest distance
def nearest_distance(zone_lat, zone_lon, poi_df):
    min_dist = float('inf')
    for _, poi in poi_df.iterrows():
        dist = haversine_distance(zone_lat, zone_lon, poi['latitude'], poi['longitude'])
        if dist < min_dist:
            min_dist = dist
    return min_dist

print("="*80)
print("ZONE FEATURE ENGINEERING")
print("="*80)

# Load cleaned datasets
print("\nLoading cleaned datasets...")
metro = pd.read_csv('cleaned_data/metro_stations_clean.csv')
mmts = pd.read_csv('cleaned_data/mmts_stops_clean.csv')
bus = pd.read_csv('cleaned_data/bus_stops_clean.csv')
traffic = pd.read_csv('cleaned_data/traffic_chokepoints_clean.csv')
police = pd.read_csv('cleaned_data/police_stations_clean.csv')
commercial = pd.read_csv('cleaned_data/commercial_zones_clean.csv')
flood = pd.read_csv('cleaned_data/flood_vulnerable_zones_clean.csv')

print(f"  ✓ Metro stations: {len(metro)} rows")
print(f"  ✓ MMTS stops: {len(mmts)} rows")
print(f"  ✓ Bus stops: {len(bus)} rows")
print(f"  ✓ Traffic chokepoints: {len(traffic)} rows")
print(f"  ✓ Police stations: {len(police)} rows")
print(f"  ✓ Commercial zones: {len(commercial)} rows")
print(f"  ✓ Flood vulnerable zones: {len(flood)} rows")

# Define 15 key Hyderabad zones with approximate coordinates
# These are major business/residential/tech hubs
zones = [
    {'zone_name': 'HITEC City', 'latitude': 17.4435, 'longitude': 78.3772},
    {'zone_name': 'Gachibowli', 'latitude': 17.4400, 'longitude': 78.3487},
    {'zone_name': 'Madhapur', 'latitude': 17.4485, 'longitude': 78.3908},
    {'zone_name': 'Jubilee Hills', 'latitude': 17.4239, 'longitude': 78.4036},
    {'zone_name': 'Secunderabad', 'latitude': 17.4399, 'longitude': 78.4983},
    {'zone_name': 'Ameerpet', 'latitude': 17.4374, 'longitude': 78.4482},
    {'zone_name': 'Kukatpally', 'latitude': 17.4849, 'longitude': 78.4138},
    {'zone_name': 'Banjara Hills', 'latitude': 17.4126, 'longitude': 78.4502},
    {'zone_name': 'Old City', 'latitude': 17.3616, 'longitude': 78.4747},
    {'zone_name': 'Kondapur', 'latitude': 17.4651, 'longitude': 78.3646},
    {'zone_name': 'Begumpet', 'latitude': 17.4380, 'longitude': 78.4676},
    {'zone_name': 'Miyapur', 'latitude': 17.4967, 'longitude': 78.3583},
    {'zone_name': 'Uppal', 'latitude': 17.4065, 'longitude': 78.5591},
    {'zone_name': 'LB Nagar', 'latitude': 17.3520, 'longitude': 78.5530},
    {'zone_name': 'Financial District', 'latitude': 17.4281, 'longitude': 78.3389},
]

zones_df = pd.DataFrame(zones)

print(f"\nEngineering features for {len(zones_df)} key Hyderabad zones...")
print("This may take a few minutes...\n")

# Engineer features for each zone
features_list = []

for idx, zone in zones_df.iterrows():
    zone_name = zone['zone_name']
    lat = zone['latitude']
    lon = zone['longitude']

    print(f"[{idx+1}/{len(zones_df)}] Processing {zone_name}...")

    # Metro features
    metro_count_1km = count_within_radius(lat, lon, metro, 1.0)
    nearest_metro_dist = nearest_distance(lat, lon, metro)

    # MMTS features
    mmts_count_1km = count_within_radius(lat, lon, mmts, 1.0)

    # Bus features
    bus_count_500m = count_within_radius(lat, lon, bus, 0.5)
    bus_count_1km = count_within_radius(lat, lon, bus, 1.0)

    # Traffic features
    traffic_nearby = count_within_radius(lat, lon, traffic, 1.0) > 0
    nearest_traffic_dist = nearest_distance(lat, lon, traffic)

    # Police features
    nearest_police_dist = nearest_distance(lat, lon, police)

    # Commercial features
    commercial_count_500m = count_within_radius(lat, lon, commercial, 0.5)
    commercial_count_1km = count_within_radius(lat, lon, commercial, 1.0)

    # Flood features
    is_flood_prone = count_within_radius(lat, lon, flood, 0.5) > 0

    # Combine rail (metro + MMTS)
    total_rail_count_1km = metro_count_1km + mmts_count_1km

    features = {
        'zone_name': zone_name,
        'latitude': lat,
        'longitude': lon,
        'metro_count_1km': metro_count_1km,
        'mmts_count_1km': mmts_count_1km,
        'total_rail_count_1km': total_rail_count_1km,
        'nearest_metro_distance_km': round(nearest_metro_dist, 2),
        'bus_stop_count_500m': bus_count_500m,
        'bus_stop_count_1km': bus_count_1km,
        'traffic_chokepoint_nearby': traffic_nearby,
        'nearest_traffic_distance_km': round(nearest_traffic_dist, 2),
        'commercial_density_500m': commercial_count_500m,
        'commercial_density_1km': commercial_count_1km,
        'is_flood_prone': is_flood_prone,
        'nearest_police_station_km': round(nearest_police_dist, 2),
    }

    features_list.append(features)

# Create final dataframe
zones_features_df = pd.DataFrame(features_list)

print("\n" + "="*80)
print("FEATURE ENGINEERING COMPLETE")
print("="*80)

print(f"\nGenerated features:")
print(zones_features_df.head(10))

print(f"\nFeature summary statistics:")
print(zones_features_df.describe())

# Save to CSV
zones_features_df.to_csv('cleaned_data/hyderabad_zones_features.csv', index=False)
print(f"\n✓ Saved to: cleaned_data/hyderabad_zones_features.csv")

print("\nFeatures created per zone:")
print(f"  • metro_count_1km — Metro stations within 1km")
print(f"  • mmts_count_1km — MMTS stops within 1km")
print(f"  • total_rail_count_1km — Total rail (metro + MMTS) within 1km")
print(f"  • nearest_metro_distance_km — Distance to nearest metro station")
print(f"  • bus_stop_count_500m — Bus stops within 500m")
print(f"  • bus_stop_count_1km — Bus stops within 1km")
print(f"  • traffic_chokepoint_nearby — Boolean: traffic congestion within 1km")
print(f"  • nearest_traffic_distance_km — Distance to nearest chokepoint")
print(f"  • commercial_density_500m — Commercial zones within 500m")
print(f"  • commercial_density_1km — Commercial zones within 1km")
print(f"  • is_flood_prone — Boolean: flood zone overlap within 500m")
print(f"  • nearest_police_station_km — Distance to nearest police station (safety)")
