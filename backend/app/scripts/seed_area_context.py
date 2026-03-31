"""
Seed AreaContext table from backend/app/data/area_context.csv.
Run: docker compose exec backend python app/scripts/seed_area_context.py
Idempotent — skips if data already exists.
"""

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlmodel import Session, select

from app.core.db import engine
from app.models import AreaContext

DATA_FILE = Path(__file__).parent.parent / "data" / "area_context.csv"


def seed():
    with Session(engine) as session:
        existing = session.exec(select(AreaContext)).first()
        if existing:
            print("AreaContext already seeded — skipping.")
            return

        rows = []
        with open(DATA_FILE) as f:
            for row in csv.DictReader(f):
                rows.append(AreaContext(
                    zone_name=row["zone_name"],
                    latitude=float(row["latitude"]),
                    longitude=float(row["longitude"]),
                    metro_count_1km=int(row["metro_count_1km"]),
                    bus_stop_count_1km=int(row["bus_stop_count_1km"]),
                    traffic_chokepoint_nearby=row["traffic_chokepoint_nearby"].lower() == "true",
                    commercial_density_1km=int(row["commercial_density_1km"]),
                    is_flood_prone=row["is_flood_prone"].lower() == "true",
                    nearest_metro_distance_km=float(row["nearest_metro_distance_km"]),
                    risk_level=row["risk_level"],
                ))

        session.add_all(rows)
        session.commit()
        print(f"✓ Seeded {len(rows)} zones into AreaContext.")


if __name__ == "__main__":
    seed()
