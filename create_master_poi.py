import pandas as pd

print("="*80)
print("CREATING MASTER POI (POINT OF INTEREST) FILE")
print("="*80)

# Load all cleaned POI datasets
print("\nLoading cleaned datasets...")
metro = pd.read_csv('cleaned_data/metro_stations_clean.csv')
mmts = pd.read_csv('cleaned_data/mmts_stops_clean.csv')
bus = pd.read_csv('cleaned_data/bus_stops_clean.csv')
traffic = pd.read_csv('cleaned_data/traffic_chokepoints_clean.csv')
police = pd.read_csv('cleaned_data/police_stations_clean.csv')
commercial = pd.read_csv('cleaned_data/commercial_zones_clean.csv')
flood = pd.read_csv('cleaned_data/flood_vulnerable_zones_clean.csv')

print(f"  ✓ Metro: {len(metro)} points")
print(f"  ✓ MMTS: {len(mmts)} points")
print(f"  ✓ Bus: {len(bus)} points")
print(f"  ✓ Traffic: {len(traffic)} points")
print(f"  ✓ Police: {len(police)} points")
print(f"  ✓ Commercial: {len(commercial)} points")
print(f"  ✓ Flood: {len(flood)} points")

# Concatenate all POIs
print("\nCombining all POI datasets...")
all_pois = pd.concat([metro, mmts, bus, traffic, police, commercial, flood], ignore_index=True)

print(f"  ✓ Total POIs: {len(all_pois)}")

# Verify structure
print(f"\nColumn structure: {all_pois.columns.tolist()}")
print(f"\nPOI type distribution:")
print(all_pois['zone_type'].value_counts())

# Save master POI file
all_pois.to_csv('cleaned_data/hyderabad_all_pois.csv', index=False)
print(f"\n✓ Saved to: cleaned_data/hyderabad_all_pois.csv")

print("\n" + "="*80)
print("MASTER POI FILE CREATED")
print("="*80)
print("\nThis file contains all Hyderabad points of interest in a single CSV.")
print("Useful for:")
print("  • Geocoding lookups")
print("  • Spatial analysis")
print("  • Mapping/visualization")
print("  • Distance calculations")
