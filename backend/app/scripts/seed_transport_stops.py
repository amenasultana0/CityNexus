"""
Seed TransportStop table from backend/app/data/transport_layer.csv.
Run: docker compose exec backend python app/scripts/seed_transport_stops.py
Idempotent — skips if data already exists.
~8,035 rows — uses bulk insert for speed.
"""

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy import insert
from sqlmodel import Session, select

from app.core.db import engine
from app.models import TransportStop

DATA_FILE = Path(__file__).parent.parent / "data" / "transport_layer.csv"

BATCH_SIZE = 500


def seed():
    with Session(engine) as session:
        existing = session.exec(select(TransportStop)).first()
        if existing:
            print("TransportStop already seeded — skipping.")
            return

        rows = []
        with open(DATA_FILE) as f:
            for row in csv.DictReader(f):
                rows.append({
                    "name": row["name"],
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                    "stop_type": row["stop_type"],
                    "zone_name": row["zone_name"] or None,
                })

    inserted = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        with Session(engine) as sess:
            sess.execute(insert(TransportStop), batch)
            sess.commit()
        inserted += len(batch)
        print(f"  {inserted:,}/{len(rows):,} stops inserted...", end="\r")

    print(f"✓ Seeded {inserted:,} stops into TransportStop.          ")


if __name__ == "__main__":
    seed()
