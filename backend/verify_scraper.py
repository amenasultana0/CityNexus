"""
Verification script for scrape_tsrtc.py logic.
Run: docker compose exec backend python verify_scraper.py
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from sqlmodel import Session, select
from app.core.db import engine
from app.models import BusRoute

# ── replicated exactly from the script ────────────────────────────────────────

def _to_minutes(hhmm: str) -> int:
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


def get_next_bus_time(route: str, direction: str = "forward", current_time=None):
    with Session(engine) as session:
        record = session.exec(
            select(BusRoute).where(
                BusRoute.route == route,
                BusRoute.direction == direction,
            )
        ).first()
    if not record:
        return "__NO_RECORD__"
    if not record.timetable_json:
        return "__EMPTY_TIMETABLE__"
    timetable = json.loads(record.timetable_json)
    if not timetable:
        return "__EMPTY_TIMETABLE__"
    now = current_time or datetime.now(timezone.utc)
    current_mins = now.hour * 60 + now.minute
    for departure in timetable:
        if _to_minutes(departure) > current_mins:
            return departure
    return None


def t(h: int, m: int) -> datetime:
    """Fake datetime at HH:MM UTC."""
    return datetime(2026, 4, 23, h, m, tzinfo=timezone.utc)


PASS = "✅ PASS"
FAIL = "❌ FAIL"
failures = 0


def check(label: str, got, expected):
    global failures
    ok = got == expected
    if not ok:
        failures += 1
    status = PASS if ok else FAIL
    print(f"  {status}  {label}")
    print(f"         expected={expected!r}  got={got!r}")


# ── TEST 1: Time edge cases ────────────────────────────────────────────────────
# Forward timetable: ['05:50','06:05','07:20','07:55','08:10','09:25',
#                     '13:00','13:25','13:45','14:35','15:05','15:35',
#                     '15:50','16:40','17:25','19:40']

print("=" * 60)
print("TEST 1 — TIME EDGE CASES  (route 8A, forward)")
print("=" * 60)

check("before first bus (04:00) → first bus",
      get_next_bus_time("8A", "forward", t(4, 0)), "05:50")

check("exact match of first bus (05:50) → NEXT bus, not same",
      get_next_bus_time("8A", "forward", t(5, 50)), "06:05")

check("exact match of mid bus (09:25) → NEXT bus, not same",
      get_next_bus_time("8A", "forward", t(9, 25)), "13:00")

check("between two buses (13:10) → next departure",
      get_next_bus_time("8A", "forward", t(13, 10)), "13:25")

check("one minute before last bus (19:39) → last bus",
      get_next_bus_time("8A", "forward", t(19, 39)), "19:40")

check("exact match of last bus (19:40) → None (no next)",
      get_next_bus_time("8A", "forward", t(19, 40)), None)

check("after last bus (23:00) → None",
      get_next_bus_time("8A", "forward", t(23, 0)), None)

# ── TEST 2: Direction handling ─────────────────────────────────────────────────
print()
print("=" * 60)
print("TEST 2 — DIRECTION HANDLING")
print("=" * 60)

fwd_7 = get_next_bus_time("8A", "forward", t(7, 0))
ret_7 = get_next_bus_time("8A", "return",  t(7, 0))

check("forward at 07:00 → 07:20 (next forward departure)",
      fwd_7, "07:20")

check("return at 07:00 → 07:10 (next return departure)",
      ret_7, "07:10")

check("forward and return give DIFFERENT results at same time",
      fwd_7 != ret_7, True)

# Confirm the return direction matches Secunderabad→Chandrayangutta
with Session(engine) as s:
    rec = s.exec(
        select(BusRoute).where(
            BusRoute.route == "8A",
            BusRoute.direction == "return",
        )
    ).first()
    ret_src = rec.source if rec else None
    ret_dst = rec.destination if rec else None

check("return.source is Secunderabad Railway Station",
      ret_src, "Secunderabad Railway Station")

check("return.destination contains Chandrayangutta",
      "Chandrayangutta" in (ret_dst or ""), True)

# ── TEST 3: Missing route handling ────────────────────────────────────────────
print()
print("=" * 60)
print("TEST 3 — MISSING ROUTE HANDLING")
print("=" * 60)

try:
    result = get_next_bus_time("999X", "forward", t(10, 0))
    check("unknown route 999X → __NO_RECORD__ (no crash)", result, "__NO_RECORD__")
except Exception as exc:
    failures += 1
    print(f"  {FAIL}  unknown route 999X → CRASHED: {exc}")

try:
    result = get_next_bus_time("8A", "nonexistent_direction", t(10, 0))
    check("valid route, invalid direction → __NO_RECORD__ (no crash)",
          result, "__NO_RECORD__")
except Exception as exc:
    failures += 1
    print(f"  {FAIL}  invalid direction → CRASHED: {exc}")

# ── Summary ────────────────────────────────────────────────────────────────────
print()
print("=" * 60)
if failures == 0:
    print("ALL TESTS PASSED ✅")
else:
    print(f"{failures} TEST(S) FAILED ❌")
print("=" * 60)
sys.exit(failures)
