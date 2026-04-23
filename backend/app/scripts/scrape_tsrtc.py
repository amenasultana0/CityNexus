"""
backend/app/scripts/scrape_tsrtc.py

Periodic scraper for Hyderabad city bus route data.
Source: https://hyderabadcitybus.in/route-no/<ROUTE>/

Stores two rows per route — "forward" and "return" directions separately.
Each row holds the actual timetable (all departure times), not an average frequency.

Schedule recommendation: every 4–6 hours via cron / APScheduler.
NOT real-time — data represents published scheduled timings only.
Do NOT call from API request handlers.

Usage:
    docker compose exec backend python app/scripts/scrape_tsrtc.py
    docker compose exec backend python app/scripts/scrape_tsrtc.py --routes 8A 10 211T
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup, NavigableString, Tag
from sqlmodel import Session, select

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.core.db import engine
from app.models import BusRoute

# ─── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("scrape_tsrtc")

# ─── Configuration ─────────────────────────────────────────────────────────────

BASE_URL = "https://hyderabadcitybus.in/route-no/{route}/"

DEFAULT_ROUTES: list[str] = [
    "1K", "5H", "8A", "10", "10H", "18", "20", "26", "29",
    "47", "65", "106", "112", "119", "123", "211T",
    "252", "286", "288", "PVNR", "MMX",
]

REQUEST_TIMEOUT_S = 15
BETWEEN_REQUESTS_DELAY_S = 2.0

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# ─── Regex (compiled once) ─────────────────────────────────────────────────────

# Matches raw AM/PM times like "5:50 AM", "12:30 PM" — used to extract timetable
_RAW_TIME_RE = re.compile(r"\d{1,2}:\d{2}\s*[AaPp][Mm]")

# Matches "Time table for Buses from X towards (→) Y"
# group(1) = source, group(2) = destination
_RE_TIMETABLE_HDR = re.compile(
    r"time\s+table\s+for\s+buses?\s+from\s+"
    r"(.+?)"                          # source stop — non-greedy
    r"\s+towards?\s+(?:\([^)]*\)\s*)?"  # "towards" + optional "(→)" or similar
    r"(.+?)\s*$",                     # destination stop — to end of string
    re.IGNORECASE,
)

# ─── Step 1: Fetch ─────────────────────────────────────────────────────────────

def fetch_page(route: str) -> Optional[str]:
    """
    Fetch raw HTML for a single route page.
    Returns HTML string on success, None on any failure.
    Never raises — all errors are logged and absorbed.
    """
    url = BASE_URL.format(route=route)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT_S)
        resp.raise_for_status()
        log.info("[%s] Fetched %s — %d bytes", route, url, len(resp.text))
        return resp.text
    except requests.exceptions.Timeout:
        log.warning("[%s] Request timed out: %s", route, url)
    except requests.exceptions.HTTPError as exc:
        log.warning("[%s] HTTP %s: %s", route, exc.response.status_code, url)
    except requests.exceptions.ConnectionError:
        log.warning("[%s] Connection error: %s", route, url)
    except requests.exceptions.RequestException as exc:
        log.warning("[%s] Request failed: %s", route, exc)
    return None

# ─── Step 2: Parse ─────────────────────────────────────────────────────────────

def parse_html(html: str) -> BeautifulSoup:
    """Parse raw HTML. Prefers lxml for speed; falls back to html.parser."""
    try:
        return BeautifulSoup(html, "lxml")
    except Exception:
        return BeautifulSoup(html, "html.parser")

# ─── Time helpers ──────────────────────────────────────────────────────────────

def _normalize_time(raw: str) -> Optional[str]:
    """
    Convert a raw time string to 24-hour HH:MM.
    Handles: "5:50 AM", "11:30 PM", "23:00", "05:30"
    Returns None for invalid values.
    """
    raw = raw.strip()

    # 12-hour: "5:30 AM" / "11:30 PM"
    m = re.match(r"^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$", raw)
    if m:
        h, mi, period = int(m.group(1)), int(m.group(2)), m.group(3).upper()
        h = (0 if h == 12 else h) if period == "AM" else (12 if h == 12 else h + 12)
        if 0 <= h <= 23 and 0 <= mi <= 59:
            return f"{h:02d}:{mi:02d}"
        return None

    # 24-hour: "05:30" / "23:00"
    m = re.match(r"^(\d{1,2}):(\d{2})$", raw)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        if 0 <= h <= 23 and 0 <= mi <= 59:
            return f"{h:02d}:{mi:02d}"

    return None


def _to_minutes(hhmm: str) -> int:
    """Convert 'HH:MM' to minutes since midnight."""
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m

# ─── Direction parsing ─────────────────────────────────────────────────────────

def _find_timetable_headers(soup: BeautifulSoup) -> list[Tag]:
    """
    Find all h3 elements whose text starts with "Time table for Buses from".
    Returns them in document order — index 0 = forward, index 1 = return.
    """
    return [
        h3 for h3 in soup.find_all("h3")
        if re.search(r"time\s+table\s+for\s+buses?\s+from", h3.get_text(), re.I)
    ]


def _parse_header_src_dst(h3_text: str) -> tuple[Optional[str], Optional[str]]:
    """
    Extract source and destination from a timetable header like:
    "Time table for Buses from Chandrayangutta X Road towards (→) Secunderabad Railway Station"
    Returns (source, destination) as title-cased strings.
    """
    m = _RE_TIMETABLE_HDR.search(h3_text.strip())
    if not m:
        return None, None
    src = m.group(1).strip().strip(".,- '\"").title()
    dst = m.group(2).strip().strip(".,- '\"").title()
    if len(src) >= 3 and len(dst) >= 3:
        return src, dst
    return None, None


def _extract_timetable_after_h3(h3_el: Tag) -> list[str]:
    """
    Extract departure times for one direction.

    Page structure (hyderabadcitybus.in):
        <div id="time-table-onwards-route">
            <h3>Time table for Buses from X towards Y</h3>   ← h3_el
        </div>
        <ul class="onwards-time-table">                      ← times are HERE
            <li>First Bus</li><li>5:50 AM</li>...
        </ul>

    The <ul> is a sibling of h3's PARENT div, not of the h3 itself.
    We walk parent.next_siblings and collect the first <ul> we find.
    """
    raw: list[str] = []
    container = h3_el.parent  # The wrapper div that contains only this h3

    for sibling in container.next_siblings:
        if not isinstance(sibling, Tag):
            continue
        if sibling.name == "ul":
            # Found the timetable list — extract all time strings from it
            raw.extend(_RAW_TIME_RE.findall(sibling.get_text(separator=" ")))
            break
        # If we hit a div that contains another h3, we've crossed into a new section
        if sibling.name == "div" and sibling.find("h3"):
            break

    # Normalise → deduplicate → sort chronologically
    seen: set[str] = set()
    times: list[str] = []
    for r in raw:
        t = _normalize_time(r.strip())
        if t and t not in seen:
            seen.add(t)
            times.append(t)
    return sorted(times, key=_to_minutes)


def _parse_stop_table(table: Tag) -> list[str]:
    """
    Extract stop names from a 3-column table:
        Stop No. | Bus Stop Name | First Bus Timings
    Column index 1 (0-based) holds the stop name.
    """
    HEADER_LABELS = {"bus stop name", "stop name", "stops", "stop", "name"}
    stops: list[str] = []
    for row in table.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        name = cells[1].get_text(strip=True)
        if name.lower() in HEADER_LABELS:
            continue
        if name and len(name) >= 3 and not name.isdigit():
            stops.append(name)
    return stops


def _extract_stops_before_h3(h3_el: Tag) -> list[str]:
    """
    The stop table is a sibling of h3's parent div, sitting BEFORE it.

    Page structure:
        <div id="onwards-route"><h3>Bus no '8A'...</h3></div>
        <table>  ← stop table (forward)
        <div id="time-table-onwards-route"><h3>Time table...</h3></div>

    Walk container.previous_siblings to find the nearest <table>.
    Stop if we hit a div that itself contains an h3 (a different section).
    """
    container = h3_el.parent

    for prev in container.previous_siblings:
        if not isinstance(prev, Tag):
            continue
        if prev.name == "table":
            stops = _parse_stop_table(prev)
            if len(stops) >= 3:
                return stops
        # Crossed into a different direction's section — stop looking
        if prev.name == "div" and prev.find("h3"):
            break

    return []

# ─── Step 3: Orchestrate one route ────────────────────────────────────────────

def scrape_route(route: str) -> list[dict]:
    """
    Fetch and parse one route page, returning up to two direction dicts
    (forward + return). Returns an empty list if the page fails entirely.
    """
    html = fetch_page(route)
    if not html:
        return []

    try:
        soup = parse_html(html)

        # Each "Time table for Buses from X towards Y" h3 defines one direction
        timetable_headers = _find_timetable_headers(soup)
        if not timetable_headers:
            log.warning("[%s] No timetable sections found — skipping.", route)
            return []

        direction_labels = ["forward", "return"]
        results: list[dict] = []

        for i, h3 in enumerate(timetable_headers[:2]):  # at most 2 directions
            direction = direction_labels[i]
            h3_text = h3.get_text()

            source, destination = _parse_header_src_dst(h3_text)
            timetable = _extract_timetable_after_h3(h3)
            stops = _extract_stops_before_h3(h3)

            # Derive first/last from the actual timetable (ground truth)
            first_bus = timetable[0] if timetable else None
            last_bus  = timetable[-1] if timetable else None
            trips     = len(timetable) if timetable else None

            log.info(
                "[%s/%s] src=%s dst=%s first=%s last=%s trips=%s stops=%d",
                route, direction, source, destination,
                first_bus, last_bus, trips, len(stops),
            )

            # Skip if we have nothing at all
            if not timetable and not source:
                log.warning("[%s/%s] No usable data — skipping direction.", route, direction)
                continue

            results.append({
                "route":          route,
                "direction":      direction,
                "source":         source,
                "destination":    destination,
                "first_bus":      first_bus,
                "last_bus":       last_bus,
                "trips_per_day":  trips,
                "timetable_json": json.dumps(timetable, ensure_ascii=False),
                "stops_json":     json.dumps(stops, ensure_ascii=False) if stops else None,
            })

        return results

    except Exception:
        log.error("[%s] Unexpected error during parsing.", route, exc_info=True)
        return []

# ─── Step 4: Store ─────────────────────────────────────────────────────────────

def _upsert_route(session: Session, data: dict) -> None:
    """
    Insert or update a BusRoute record keyed on (route, direction).
    Caller is responsible for committing the session.
    """
    existing = session.exec(
        select(BusRoute).where(
            BusRoute.route     == data["route"],
            BusRoute.direction == data["direction"],
        )
    ).first()

    now = datetime.now(timezone.utc)

    if existing:
        existing.source         = data["source"]
        existing.destination    = data["destination"]
        existing.first_bus      = data["first_bus"]
        existing.last_bus       = data["last_bus"]
        existing.trips_per_day  = data["trips_per_day"]
        existing.timetable_json = data["timetable_json"]
        existing.stops_json     = data["stops_json"]
        existing.last_updated   = now
        session.add(existing)
        log.info("[%s/%s] Record updated.", data["route"], data["direction"])
    else:
        session.add(BusRoute(
            route          = data["route"],
            direction      = data["direction"],
            source         = data["source"],
            destination    = data["destination"],
            first_bus      = data["first_bus"],
            last_bus       = data["last_bus"],
            trips_per_day  = data["trips_per_day"],
            timetable_json = data["timetable_json"],
            stops_json     = data["stops_json"],
            last_updated   = now,
        ))
        log.info("[%s/%s] New record inserted.", data["route"], data["direction"])


def store_results(results: list[dict]) -> None:
    """
    Persist all direction records. Each record gets its own transaction so
    one failure doesn't prevent the rest from being saved.
    """
    saved = 0
    for data in results:
        try:
            with Session(engine) as session:
                _upsert_route(session, data)
                session.commit()
            saved += 1
        except Exception:
            log.error(
                "[%s/%s] DB write failed.",
                data["route"], data["direction"], exc_info=True,
            )
    log.info("Stored %d/%d direction record(s) successfully.", saved, len(results))

# ─── Next bus lookup ───────────────────────────────────────────────────────────

def get_next_bus_time(
    route: str,
    direction: str = "forward",
    current_time: Optional[datetime] = None,
) -> Optional[str]:
    """
    Return the next scheduled departure after the given time.

    Looks up the stored timetable (not an average frequency) and finds the
    first entry that is strictly later than current_time.
    This is NOT real-time — it reflects the published scheduled timetable.

    Args:
        route:        Route number e.g. "8A"
        direction:    "forward" or "return" (default "forward")
        current_time: Reference time (defaults to now UTC). Date is ignored.

    Returns:
        "HH:MM" of the next departure, or None if:
          - No record found for this (route, direction)
          - No timetable stored
          - All buses for today have already departed
    """
    with Session(engine) as session:
        record = session.exec(
            select(BusRoute).where(
                BusRoute.route     == route,
                BusRoute.direction == direction,
            )
        ).first()

    if not record:
        log.warning("get_next_bus_time: (%s/%s) not found in DB.", route, direction)
        return None

    if not record.timetable_json:
        log.warning("get_next_bus_time: (%s/%s) has no timetable.", route, direction)
        return None

    timetable: list[str] = json.loads(record.timetable_json)
    if not timetable:
        return None

    now = current_time or datetime.now(timezone.utc)
    current_mins = now.hour * 60 + now.minute

    # Linear scan — timetable is sorted, so first match is the answer
    for departure in timetable:
        if _to_minutes(departure) > current_mins:
            return departure

    return None  # All buses have already left for today

# ─── Main loop ─────────────────────────────────────────────────────────────────

def run_scraper(routes: list[str]) -> None:
    """
    Main entry point. For each route: fetch → parse → store both directions.
    Throttles between HTTP requests to avoid hammering the server.
    """
    log.info("=== TSRTC scraper starting — %d route(s) queued ===", len(routes))

    all_results: list[dict] = []

    for i, route in enumerate(routes):
        direction_records = scrape_route(route)
        all_results.extend(direction_records)

        if i < len(routes) - 1:
            time.sleep(BETWEEN_REQUESTS_DELAY_S)

    log.info(
        "Scraping done: %d direction record(s) from %d route(s).",
        len(all_results), len(routes),
    )

    if all_results:
        store_results(all_results)
    else:
        log.warning("Nothing to store — all routes failed.")

    log.info("=== TSRTC scraper finished ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Scrape Hyderabad bus timetable data. NOT real-time."
    )
    parser.add_argument(
        "--routes",
        nargs="+",
        default=DEFAULT_ROUTES,
        metavar="ROUTE",
        help="Route numbers to scrape (default: built-in list)",
    )
    args = parser.parse_args()
    run_scraper(args.routes)
