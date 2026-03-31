"""
Seed DemandPattern table from backend/app/data/demand_patterns.csv.
Run: docker compose exec backend python app/scripts/seed_demand_patterns.py
Idempotent — skips if data already exists.
"""

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy import insert
from sqlmodel import Session, select

from app.core.db import engine
from app.models import DemandPattern

DATA_FILE = Path(__file__).parent.parent / "data" / "demand_patterns.csv"

BATCH_SIZE = 500


def seed():
    with Session(engine) as session:
        existing = session.exec(select(DemandPattern)).first()
        if existing:
            print("DemandPattern already seeded — skipping.")
            return

        rows = []
        with open(DATA_FILE) as f:
            for row in csv.DictReader(f):
                rows.append({
                    "constituency_num": row["constituency_num"],
                    "hour_of_day": int(row["hour_of_day"]),
                    "day_of_week": int(row["day_of_week"]),
                    "cancel_rate": float(row["cancel_rate"]),
                    "booking_count": int(row["booking_count"]),
                    "driver_supply": int(row["driver_supply"]),
                })

        # Bulk insert in batches for speed
        inserted = 0
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i : i + BATCH_SIZE]
            session.execute(insert(DemandPattern), batch)
            inserted += len(batch)

        session.commit()
        print(f"✓ Seeded {inserted:,} demand pattern rows into DemandPattern.")


if __name__ == "__main__":
    seed()
