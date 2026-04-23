"""
DB audit: check all busroute records for nulls, count mismatches, consistency.
Run: docker compose exec backend python audit_busroutes.py
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from sqlmodel import Session, select
from app.core.db import engine
from app.models import BusRoute

PASS = "✅"
FAIL = "❌"

with Session(engine) as s:
    rows = s.exec(select(BusRoute).order_by(BusRoute.route, BusRoute.direction)).all()

print(f"Total records in DB: {len(rows)}\n")

HDR = f"{'':2} {'ROUTE':<7} {'DIR':<8} {'SOURCE':<28} {'DEST':<28} {'FIRST':<6} {'LAST':<6} {'TRIPS':<6} {'TT#':<4} {'STOPS#'}"
print(HDR)
print("-" * len(HDR))

all_issues = []

for r in rows:
    tt = json.loads(r.timetable_json) if r.timetable_json else []
    st = json.loads(r.stops_json)     if r.stops_json     else []

    flags = []
    if not r.source:                                       flags.append("NO_SRC")
    if not r.destination:                                  flags.append("NO_DST")
    if not r.first_bus:                                    flags.append("NO_FIRST")
    if not r.last_bus:                                     flags.append("NO_LAST")
    if not r.trips_per_day:                                flags.append("NO_TRIPS")
    if not tt:                                             flags.append("NO_TIMETABLE")
    if len(tt) != (r.trips_per_day or -1):                 flags.append(f"TT_COUNT_MISMATCH(tt={len(tt)},trips={r.trips_per_day})")
    if not st:                                             flags.append("NO_STOPS")
    if tt and r.first_bus and tt[0] != r.first_bus:        flags.append(f"FIRST_MISMATCH(tt={tt[0]},db={r.first_bus})")
    if tt and r.last_bus  and tt[-1] != r.last_bus:        flags.append(f"LAST_MISMATCH(tt={tt[-1]},db={r.last_bus})")

    icon = PASS if not flags else FAIL
    src  = (r.source      or "NULL")[:27]
    dst  = (r.destination or "NULL")[:27]
    print(f"{icon} {r.route:<7} {r.direction:<8} {src:<28} {dst:<28} {str(r.first_bus):<6} {str(r.last_bus):<6} {str(r.trips_per_day):<6} {len(tt):<4} {len(st)}")

    if flags:
        print(f"   ⚠  {flags}")
        all_issues.append((r.route, r.direction, flags))

print()
if all_issues:
    print(f"ISSUES FOUND in {len(all_issues)} record(s):")
    for route, direction, flags in all_issues:
        print(f"  {route}/{direction}: {flags}")
    sys.exit(1)
else:
    print("All records clean — no nulls, no mismatches. ✅")
    sys.exit(0)
