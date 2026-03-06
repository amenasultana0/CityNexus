import pandas as pd
import json
import os

# Hyderabad coordinate bounds
LAT_MIN, LAT_MAX = 17.2, 17.7
LON_MIN, LON_MAX = 78.2, 78.8

# Create cleaned_data directory
os.makedirs('cleaned_data', exist_ok=True)

print("="*80)
print("DATA CLEANING PROCESS")
print("="*80)

# 1. Metro Stations - Already clean, just standardize
print("\n[1/9] Cleaning metro_stations.csv...")
metro = pd.read_csv('raw_data/metro_stations.csv')
metro_clean = metro[['name', 'latitude', 'longitude', 'zone_type']].copy()
print(f"  ✓ Rows: {len(metro)} → {len(metro_clean)} (no changes)")
metro_clean.to_csv('cleaned_data/metro_stations_clean.csv', index=False)

# 2. MMTS Stops - Already clean
print("\n[2/9] Cleaning mmts_stops.csv...")
mmts = pd.read_csv('raw_data/mmts_stops.csv')
mmts_clean = mmts[['name', 'latitude', 'longitude', 'zone_type']].copy()
print(f"  ✓ Rows: {len(mmts)} → {len(mmts_clean)} (no changes)")
mmts_clean.to_csv('cleaned_data/mmts_stops_clean.csv', index=False)

# 3. Bus Stops - Already clean, drop stop_id
print("\n[3/9] Cleaning bus_stops.csv...")
bus = pd.read_csv('raw_data/bus_stops.csv')
bus_clean = bus[['name', 'latitude', 'longitude', 'zone_type']].copy()
print(f"  ✓ Rows: {len(bus)} → {len(bus_clean)} (no changes)")
print(f"  ✓ Dropped stop_id column (not needed for modeling)")
bus_clean.to_csv('cleaned_data/bus_stops_clean.csv', index=False)

# 4. Traffic Chokepoints - Drop missing coordinates
print("\n[4/9] Cleaning traffic_chokepoints.csv...")
traffic = pd.read_csv('raw_data/traffic_chokepoints.csv')
before = len(traffic)
traffic_clean = traffic.dropna(subset=['latitude', 'longitude']).copy()
traffic_clean = traffic_clean[['name', 'latitude', 'longitude', 'zone_type']]
print(f"  ✓ Rows: {before} → {len(traffic_clean)} (removed {before - len(traffic_clean)} with missing coordinates)")
traffic_clean.to_csv('cleaned_data/traffic_chokepoints_clean.csv', index=False)

# 5. Police Stations - Already clean
print("\n[5/9] Cleaning police_stations.csv...")
police = pd.read_csv('raw_data/police_stations.csv')
police_clean = police[['name', 'latitude', 'longitude', 'zone_type']].copy()
print(f"  ✓ Rows: {len(police)} → {len(police_clean)} (no changes)")
police_clean.to_csv('cleaned_data/police_stations_clean.csv', index=False)

# 6. Commercial Zones - Remove coordinate outliers only
print("\n[6/9] Cleaning commercial_zones.csv...")
commercial = pd.read_csv('raw_data/commercial_zones.csv')
before = len(commercial)
# Filter coordinates within Hyderabad bounds
commercial_clean = commercial[
    (commercial['latitude'] >= LAT_MIN) &
    (commercial['latitude'] <= LAT_MAX) &
    (commercial['longitude'] >= LON_MIN) &
    (commercial['longitude'] <= LON_MAX)
].copy()
commercial_clean = commercial_clean[['name', 'latitude', 'longitude', 'zone_type']]
print(f"  ✓ Rows: {before} → {len(commercial_clean)} (removed {before - len(commercial_clean)} outliers)")
print(f"  ✓ Not filling name/landuse/amenity nulls (coordinates are what matter)")
commercial_clean.to_csv('cleaned_data/commercial_zones_clean.csv', index=False)

# 7. Flood Vulnerable Zones - Drop duplicates, outliers, useless columns
print("\n[7/9] Cleaning flood_vulnerable_zones.csv...")
flood = pd.read_csv('raw_data/flood_vulnerable_zones.csv')
before = len(flood)
# Drop duplicates
flood_clean = flood.drop_duplicates()
dupes_removed = before - len(flood_clean)
before_after_dupes = len(flood_clean)
# Filter coordinates
flood_clean = flood_clean[
    (flood_clean['latitude'] >= LAT_MIN) &
    (flood_clean['latitude'] <= LAT_MAX) &
    (flood_clean['longitude'] >= LON_MIN) &
    (flood_clean['longitude'] <= LON_MAX)
].copy()
outliers_removed = before_after_dupes - len(flood_clean)
# Rename locality_name to name, drop mandal & families_affected
flood_clean = flood_clean.rename(columns={'locality_name': 'name'})
flood_clean = flood_clean[['name', 'latitude', 'longitude', 'zone_type']]
print(f"  ✓ Removed {dupes_removed} duplicate rows")
print(f"  ✓ Removed {outliers_removed} coordinate outliers")
print(f"  ✓ Dropped mandal (all null) and families_affected (only using as boolean flag)")
print(f"  ✓ Final rows: {before} → {len(flood_clean)}")
flood_clean.to_csv('cleaned_data/flood_vulnerable_zones_clean.csv', index=False)

# 8. Ward Boundaries - Drop rows with missing ward_name
print("\n[8/9] Cleaning ward_boundaries.csv...")
wards = pd.read_csv('raw_data/ward_boundaries.csv')
before = len(wards)
wards_clean = wards.dropna(subset=['ward_name', 'zone']).copy()
wards_clean = wards_clean[['ward_name', 'circle', 'zone', 'area_sqkm', 'zone_type']]
print(f"  ✓ Rows: {before} → {len(wards_clean)} (removed {before - len(wards_clean)} with missing names)")
wards_clean.to_csv('cleaned_data/ward_boundaries_clean.csv', index=False)

# 9. YAARY Reviews - Drop title and scoreText, keep only essential fields
print("\n[9/9] Cleaning YAARY_Hyderabad_reviews.json...")
with open('raw_data/YAARY_Hyderabad_reviews.json', 'r') as f:
    reviews = json.load(f)

reviews_clean = []
for r in reviews:
    reviews_clean.append({
        'id': r['id'],
        'date': r['date'],
        'score': r['score'],
        'text': r['text']
    })

reviews_df = pd.DataFrame(reviews_clean)
print(f"  ✓ Reviews: {len(reviews_df)}")
print(f"  ✓ Dropped 'title' (all null) and 'scoreText' (redundant)")
reviews_df.to_csv('cleaned_data/yaary_reviews_clean.csv', index=False)

print("\n" + "="*80)
print("CLEANING COMPLETE")
print("="*80)
print(f"\nAll cleaned files saved to 'cleaned_data/' directory")
print("\nSummary:")
print(f"  • metro_stations_clean.csv: {len(metro_clean)} rows")
print(f"  • mmts_stops_clean.csv: {len(mmts_clean)} rows")
print(f"  • bus_stops_clean.csv: {len(bus_clean)} rows")
print(f"  • traffic_chokepoints_clean.csv: {len(traffic_clean)} rows")
print(f"  • police_stations_clean.csv: {len(police_clean)} rows")
print(f"  • commercial_zones_clean.csv: {len(commercial_clean)} rows")
print(f"  • flood_vulnerable_zones_clean.csv: {len(flood_clean)} rows")
print(f"  • ward_boundaries_clean.csv: {len(wards_clean)} rows")
print(f"  • yaary_reviews_clean.csv: {len(reviews_df)} rows")

print("\n✓ All POI files have standardized columns: name, latitude, longitude, zone_type")
