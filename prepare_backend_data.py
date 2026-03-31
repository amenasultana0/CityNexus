#!/usr/bin/env python3
"""
prepare_backend_data.py
Run once from project root before starting backend build.
Generates backend-ready CSV files from cleaned_data/ into backend/app/data/.
Uses only Python stdlib — no pandas required.
"""

import csv
import json
import os
import shutil
from math import atan2, cos, radians, sin, sqrt
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent
CLEANED = PROJECT_ROOT / "cleaned_data"
OUT = PROJECT_ROOT / "backend" / "app" / "data"

# Zones where cancellation risk is High based on traffic + commercial density
HIGH_RISK_ZONES = {"Old City", "Secunderabad", "Ameerpet", "Banjara Hills", "Begumpet"}

# AC numbers where bkng_cancel_rate >= 0.60
HIGH_RISK_ACS = {"14", "15", "16", "104", "105"}

# Peak hour cancel rate multipliers (derived from Bengaluru patterns)
HOUR_CANCEL_MULT = {7: 1.3, 8: 1.5, 9: 1.5, 10: 1.2, 17: 1.2, 18: 1.5, 19: 1.5, 20: 1.3}


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def nearest_zone_name(lat, lon, zones):
    return min(zones, key=lambda z: haversine_km(lat, lon, z["lat"], z["lon"]))["name"]


def load_zones():
    zones = []
    with open(CLEANED / "hyderabad_zones_features.csv") as f:
        for row in csv.DictReader(f):
            zones.append({"name": row["zone_name"], "lat": float(row["latitude"]), "lon": float(row["longitude"])})
    return zones


# ─────────────────────────────────────────────
# 1. transport_layer.csv
# ─────────────────────────────────────────────
def generate_transport_layer(zones):
    print("\n[1/4] Generating transport_layer.csv ...")
    rows = []

    sources = [
        (CLEANED / "metro_stations_clean.csv", "metro"),
        (CLEANED / "mmts_stops_clean.csv", "mmts"),
        (CLEANED / "bus_stops_clean.csv", "bus"),
    ]

    for filepath, stop_type in sources:
        with open(filepath) as f:
            for row in csv.DictReader(f):
                lat, lon = float(row["latitude"]), float(row["longitude"])
                rows.append({
                    "name": row["name"],
                    "latitude": lat,
                    "longitude": lon,
                    "stop_type": stop_type,
                    "zone_name": nearest_zone_name(lat, lon, zones),
                })
        print(f"  loaded {filepath.name}")

    out = OUT / "transport_layer.csv"
    with open(out, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "latitude", "longitude", "stop_type", "zone_name"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"  ✓ {len(rows):,} stops → transport_layer.csv")


# ─────────────────────────────────────────────
# 2. area_context.csv
# ─────────────────────────────────────────────
def generate_area_context():
    print("\n[2/4] Generating area_context.csv ...")
    rows = []

    with open(CLEANED / "hyderabad_zones_features.csv") as f:
        for row in csv.DictReader(f):
            zone = row["zone_name"]
            rows.append({
                "zone_name": zone,
                "latitude": row["latitude"],
                "longitude": row["longitude"],
                "metro_count_1km": row["metro_count_1km"],
                "bus_stop_count_1km": row["bus_stop_count_1km"],
                "traffic_chokepoint_nearby": row["traffic_chokepoint_nearby"],
                "commercial_density_1km": row["commercial_density_1km"],
                "is_flood_prone": row["is_flood_prone"],
                "nearest_metro_distance_km": row["nearest_metro_distance_km"],
                "risk_level": "high" if zone in HIGH_RISK_ZONES else "medium",
            })

    fields = [
        "zone_name", "latitude", "longitude", "metro_count_1km", "bus_stop_count_1km",
        "traffic_chokepoint_nearby", "commercial_density_1km", "is_flood_prone",
        "nearest_metro_distance_km", "risk_level",
    ]
    out = OUT / "area_context.csv"
    with open(out, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    print(f"  ✓ {len(rows)} zones → area_context.csv")


# ─────────────────────────────────────────────
# 3. demand_patterns.csv
# ─────────────────────────────────────────────
def generate_demand_patterns():
    print("\n[3/4] Processing demand_patterns.csv ...")

    # If a prepared file already exists in cleaned_data, copy it
    existing = CLEANED / "demand_patterns.csv"
    if existing.exists():
        shutil.copy(existing, OUT / "demand_patterns.csv")
        print(f"  ✓ Copied existing demand_patterns.csv from cleaned_data/")
        return

    # Generate from constituency funnel + driver supply
    with open(CLEANED / "HYDERABAD_constituency_funnel.json") as f:
        funnel = json.load(f)

    # Driver supply per AC (summed across vehicle types)
    supply_map: dict[str, int] = {}
    with open(CLEANED / "HYDERABAD_driver_supply_clean.csv") as f:
        for row in csv.DictReader(f):
            ac = str(row["ac_num"])
            supply_map[ac] = supply_map.get(ac, 0) + int(row["active_drvr"] or 0)

    rows = []
    for entry in funnel:
        ac = str(entry["ac_num"])
        base_rate = float(entry["bkng_cancel_rate"])
        daily_bookings = int(entry["booking"])
        supply = supply_map.get(ac, 5)

        for hour in range(24):
            for day in range(7):
                mult = HOUR_CANCEL_MULT.get(hour, 1.0) * (0.95 if day >= 5 else 1.0)
                rows.append({
                    "constituency_num": ac,
                    "hour_of_day": hour,
                    "day_of_week": day,
                    "cancel_rate": round(min(0.95, base_rate * mult), 4),
                    "booking_count": max(1, daily_bookings // (24 * 7)),
                    "driver_supply": supply,
                })

    out = OUT / "demand_patterns.csv"
    fields = ["constituency_num", "hour_of_day", "day_of_week", "cancel_rate", "booking_count", "driver_supply"]
    with open(out, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    print(f"  ✓ {len(rows):,} rows generated (25 ACs × 24h × 7d) → demand_patterns.csv")


# ─────────────────────────────────────────────
# 4. Calibration_HYDERABAD_constituency_funnel.csv
# ─────────────────────────────────────────────
def generate_calibration_funnel():
    print("\n[4/4] Generating Calibration_HYDERABAD_constituency_funnel.csv ...")

    with open(CLEANED / "HYDERABAD_constituency_funnel.json") as f:
        funnel = json.load(f)

    rows = []
    for entry in funnel:
        ac = str(entry["ac_num"])
        cancel_rate = float(entry["bkng_cancel_rate"])
        rows.append({
            "ac_number": ac,
            "base_cancel_rate": round(cancel_rate, 4),
            "risk_level": "high" if ac in HIGH_RISK_ACS else "medium",
            "search_to_estimate_rate": round(float(entry["srch_to_e_rate"]), 4),
            "estimate_to_quote_rate": round(float(entry["e_to_q_srch_rate"]), 4),
            "quote_to_booking_rate": round(float(entry["q_to_bkng_rate"]), 4),
            "conversion_rate": round(float(entry["cnvr_rate"]), 4),
            "avg_fare_inr": round(float(entry["avg_fare"]), 2),
            "avg_distance_km": round(float(entry["avg_dist_pr_trip"]), 2),
        })

    fields = [
        "ac_number", "base_cancel_rate", "risk_level", "search_to_estimate_rate",
        "estimate_to_quote_rate", "quote_to_booking_rate", "conversion_rate",
        "avg_fare_inr", "avg_distance_km",
    ]
    out = OUT / "Calibration_HYDERABAD_constituency_funnel.csv"
    with open(out, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    print(f"  ✓ {len(rows)} constituencies → Calibration_HYDERABAD_constituency_funnel.csv")


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("CityNexus — Backend Data Preparation")
    print("=" * 60)

    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Output: {OUT}")

    zones = load_zones()
    print(f"Loaded {len(zones)} Hyderabad zones")

    generate_transport_layer(zones)
    generate_area_context()
    generate_demand_patterns()
    generate_calibration_funnel()

    print("\n" + "=" * 60)
    print("✓ All files ready in backend/app/data/")
    print("Next steps:")
    print("  1. Run migrations: docker compose exec backend alembic upgrade head")
    print("  2. Run seeders:    docker compose exec backend python app/scripts/seed_area_context.py")
    print("=" * 60)
