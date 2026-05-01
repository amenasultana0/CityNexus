"""
Seed script — loads CSVs from /outputs into the database.
Run inside the backend container: python scripts/load_seed_data.py
"""
import csv
import os
import sys
import uuid

from sqlmodel import Session, create_engine, select

sys.path.insert(0, "/app")

from app.core.config import settings
from app.models import AreaContext, DemandPattern, HyderabadZone, TransportStop

OUTPUTS = "/outputs"

engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))


def load_transport_stops(session: Session):
    existing = session.exec(select(TransportStop).limit(1)).first()
    if existing:
        print("  transport_stop: already populated, skipping")
        return

    path = os.path.join(OUTPUTS, "transport_layer.csv")
    TYPE_MAP = {
        "metro_station": "metro",
        "mmts_stop": "mmts",
        "bus_stop": "bus",
    }
    count = 0
    with open(path) as f:
        for row in csv.DictReader(f):
            try:
                stop = TransportStop(
                    name=row["name"].strip(),
                    latitude=float(row["latitude"]),
                    longitude=float(row["longitude"]),
                    stop_type=TYPE_MAP.get(row["zone_type"].strip(), row["zone_type"].strip()),
                )
                session.add(stop)
                count += 1
            except (ValueError, KeyError):
                pass
    session.commit()
    print(f"  transport_stop: loaded {count} rows")


def load_hyderabad_zones(session: Session):
    existing = session.exec(select(HyderabadZone).limit(1)).first()
    if existing:
        print("  hyderabad_zone: already populated, skipping")
        return

    path = os.path.join(OUTPUTS, "Calibration_HYDERABAD_constituency_funnel.csv")
    RISK_MAP = {"Low": "low", "Medium": "medium", "High": "high"}
    count = 0
    with open(path) as f:
        for row in csv.DictReader(f):
            try:
                ac = str(int(float(row["ac_num"])))
                hz = HyderabadZone(
                    ac_number=ac,
                    base_cancel_rate=float(row["cancellation_rate"]),
                    risk_level=RISK_MAP.get(row["risk_level"].strip(), "medium"),
                    avg_fare_inr=float(row["avg_fare"]) if row["avg_fare"] else 180.0,
                    avg_distance_km=float(row["avg_dist_pr_trip"]) if row["avg_dist_pr_trip"] else 9.5,
                )
                session.add(hz)
                count += 1
            except (ValueError, KeyError):
                pass
    session.commit()
    print(f"  hyderabad_zone: loaded {count} rows")


def load_demand_patterns(session: Session):
    existing = session.exec(select(DemandPattern).limit(1)).first()
    if existing:
        print("  demand_pattern: already populated, skipping")
        return

    path = os.path.join(OUTPUTS, "demand_patterns.csv")
    count = 0
    with open(path) as f:
        for row in csv.DictReader(f):
            try:
                ac_num = str(row.get("ac_num", "")).strip()
                hour_raw = str(row.get("hour", "")).strip()
                dow_raw = str(row.get("day_of_week", "")).strip()
                cancel_raw = str(row.get("bkng_cancel_rate", "")).strip()
                done_raw = str(row.get("done_ride", "")).strip()
                driver_raw = str(row.get("reg_driver", "")).strip()

                # Skip rows with missing required fields
                if not ac_num or not hour_raw or not dow_raw:
                    continue

                dp = DemandPattern(
                    constituency_num=ac_num,
                    hour_of_day=int(float(hour_raw)),
                    day_of_week=int(float(dow_raw)),
                    cancel_rate=float(cancel_raw) if cancel_raw else 0.5,
                    booking_count=int(float(done_raw)) if done_raw else 0,
                    driver_supply=int(float(driver_raw)) if driver_raw else 0,
                )
                session.add(dp)
                count += 1
                if count % 1000 == 0:
                    session.commit()
            except (ValueError, KeyError):
                pass
    session.commit()
    print(f"  demand_pattern: loaded {count} rows")


def load_area_context(session: Session):
    existing = session.exec(select(AreaContext).limit(1)).first()
    if existing:
        print("  area_context: already populated, skipping")
        return

    # Build from constituency data + known Hyderabad zone coordinates
    # Using representative lat/lon for key zones
    ZONE_COORDS = {
        "NORTH  ZONE":    (17.478, 78.422),
        "SOUTH  ZONE":    (17.332, 78.464),
        "EAST   ZONE":    (17.387, 78.521),
        "WEST   ZONE":    (17.453, 78.390),
        "CENTRAL  ZONE":  (17.416, 78.474),
    }

    path = os.path.join(OUTPUTS, "area_context.csv")
    count = 0
    with open(path) as f:
        for row in csv.DictReader(f):
            try:
                zone = row.get("zone", "").strip()
                coords = ZONE_COORDS.get(zone, (17.385, 78.486))

                cancel_rate_raw = row.get("cancellation_rate", "").strip()
                cancel_rate = float(cancel_rate_raw) if cancel_rate_raw else 0.55
                risk_level = "high" if cancel_rate >= 0.6 else "medium"

                chokepoint = int(row.get("chokepoint_count", "0") or "0")
                flood = int(row.get("is_flood_prone", "0") or "0")
                density = int(float(row.get("commercial_density", "0") or "0"))

                ward_name = row.get("ward_name", "").strip()
                if not ward_name:
                    continue

                ac = AreaContext(
                    zone_name=ward_name,
                    latitude=coords[0],
                    longitude=coords[1],
                    metro_count_1km=0,
                    bus_stop_count_1km=0,
                    traffic_chokepoint_nearby=bool(chokepoint > 0),
                    commercial_density_1km=density,
                    is_flood_prone=bool(flood),
                    nearest_metro_distance_km=0.0,
                    risk_level=risk_level,
                )
                session.add(ac)
                count += 1
                if count % 200 == 0:
                    session.commit()
            except (ValueError, KeyError) as e:
                pass
    session.commit()
    print(f"  area_context: loaded {count} rows")


if __name__ == "__main__":
    print("Loading seed data...")
    with Session(engine) as session:
        load_transport_stops(session)
        load_hyderabad_zones(session)
        load_demand_patterns(session)
        load_area_context(session)
    print("Done.")
