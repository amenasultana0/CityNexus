"""
Seed HyderabadZone table from Calibration_HYDERABAD_constituency_funnel.csv.
Run: docker compose exec backend python app/scripts/seed_hyderabad_zones.py
Idempotent — skips if data already exists.
"""

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlmodel import Session, select

from app.core.db import engine
from app.models import HyderabadZone

DATA_FILE = Path(__file__).parent.parent / "data" / "Calibration_HYDERABAD_constituency_funnel.csv"


def seed():
    with Session(engine) as session:
        existing = session.exec(select(HyderabadZone)).first()
        if existing:
            print("HyderabadZone already seeded — skipping.")
            return

        rows = []
        with open(DATA_FILE) as f:
            for row in csv.DictReader(f):
                rows.append(HyderabadZone(
                    ac_number=row["ac_number"],
                    base_cancel_rate=float(row["base_cancel_rate"]),
                    risk_level=row["risk_level"],
                    search_to_estimate_rate=float(row["search_to_estimate_rate"]),
                    estimate_to_quote_rate=float(row["estimate_to_quote_rate"]),
                    quote_to_booking_rate=float(row["quote_to_booking_rate"]),
                    conversion_rate=float(row["conversion_rate"]),
                    avg_fare_inr=float(row["avg_fare_inr"]),
                    avg_distance_km=float(row["avg_distance_km"]),
                ))

        session.add_all(rows)
        session.commit()
        print(f"✓ Seeded {len(rows)} constituencies into HyderabadZone.")


if __name__ == "__main__":
    seed()
