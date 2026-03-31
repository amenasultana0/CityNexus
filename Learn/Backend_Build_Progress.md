# CityNexus Backend — Build Progress Log

**Date:** 2026-03-27
**Session scope:** Complete backend build for CityNexus — AI ride intelligence platform for Hyderabad commuters.

---

## What Was Built

Starting point: a working FastAPI + Docker + Supabase PostgreSQL base with JWT authentication already in place.

---

## Phase 0 — Data Preparation ✅

**File created:** `prepare_backend_data.py` (project root, run once)

Written using only Python stdlib (csv, json, shutil, pathlib, math — no pandas needed, since pandas is not available outside Docker).

Generates 4 CSV files into `backend/app/data/`:

| Output file | Source | Notes |
|-------------|--------|-------|
| `transport_layer.csv` | metro + mmts + bus stop CSVs | 8,035 stops merged, `stop_type` column added |
| `area_context.csv` | `hyderabad_zones_features.csv` | 15 zones, columns renamed to match DB model |
| `demand_patterns.csv` | `cleaned_data/demand_patterns.csv` | **Copied only** — source is `ALL_CITIES_daily_stats_clean.csv`, do not regenerate |
| `Calibration_HYDERABAD_constituency_funnel.csv` | `HYDERABAD_constituency_funnel.json` | 25 ACs flattened, cancel rates extracted |

**Run output confirmed:** 8,035 stops · 15 zones · 4,200 demand rows · 25 constituencies

---

## Phase 1 — Database Models ✅

**File modified:** `backend/app/models.py` — appended below `NewPassword`, existing models untouched.

6 new SQLModel tables added:

| Model | Purpose | Key fields |
|-------|---------|-----------|
| `TransportStop` | Metro / bus / MMTS stops | name, latitude, longitude, stop_type, zone_name |
| `AreaContext` | Zone-level geo + risk features | zone_name, traffic_chokepoint_nearby, is_flood_prone, risk_level |
| `DemandPattern` | Historical demand per AC / hour / day | constituency_num, hour_of_day, day_of_week, cancel_rate, booking_count, driver_supply |
| `HyderabadZone` | Constituency funnel metrics | ac_number (unique), base_cancel_rate, risk_level, funnel rates, avg_fare_inr |
| `RidePrediction` | Saved predictions (optional auth) | origin/dest coords, predicted_risk, probability, is_raining, user_id (nullable FK) |
| `UserSearch` | Saved route searches (optional auth) | origin/dest name+coords, recommended_mode, user_id (nullable FK) |

**After adding models — run inside Docker:**
```bash
docker compose exec backend alembic revision --autogenerate -m "add_citynexus_models"
docker compose exec backend alembic upgrade head
```

---

## Phase 2 — Data Seeders ✅

**New folder:** `backend/app/scripts/` (with `__init__.py`)

All scripts are idempotent — they check for existing data and skip if already seeded.

| Script | Reads | Populates | Rows |
|--------|-------|-----------|------|
| `seed_area_context.py` | `area_context.csv` | `AreaContext` | 15 |
| `seed_hyderabad_zones.py` | `Calibration_HYDERABAD_constituency_funnel.csv` | `HyderabadZone` | 25 |
| `seed_demand_patterns.py` | `demand_patterns.csv` | `DemandPattern` | ~4,200 |
| `seed_transport_stops.py` | `transport_layer.csv` | `TransportStop` | 8,035 |

`seed_demand_patterns.py` and `seed_transport_stops.py` use bulk insert in batches of 500 via `session.execute(insert(Model), batch)` for performance.

**Run after migrations (in this order):**
```bash
docker compose exec backend python app/scripts/seed_area_context.py
docker compose exec backend python app/scripts/seed_hyderabad_zones.py
docker compose exec backend python app/scripts/seed_demand_patterns.py
docker compose exec backend python app/scripts/seed_transport_stops.py
```

---

## Phase 3 — Service Layer ✅

**New folder:** `backend/app/services/` (with `__init__.py`)

### `ml_model.py`
- Tries to load `backend/app/model/cancellation_model.pkl` at import time
- If file is missing or fails: logs a warning, activates rule-based fallback silently
- **No code change needed when model arrives** — drop the `.pkl` and restart container
- Fallback rules: all zones Medium, peak hour boosts probability 15%, rain escalates to High
- `predict(features: RideFeatures, is_raining: bool) → PredictionResult`
- Hyderabad rule baked in: floor at Medium (never Low risk)

### `weather.py`
- Calls Open-Meteo API (free, no key) for Hyderabad fixed coords (17.385, 78.486)
- 15-minute in-memory cache
- Rain detected via WMO code set: `{51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99}`
- Falls back to dry weather default (28°C, 10 km/h) if API unavailable

### `transport.py`
- `find_nearest_stops(session, lat, lon, stop_type, radius_km, max_count)`
- SQL bounding-box pre-filter → exact Haversine sort for performance
- Walking speed: 80 m/min
- `nearest_stop_of_type(session, lat, lon, stop_type)` — single nearest within 2 km

### `cost.py`
All formulas deterministic — no DB, no external calls.

**Hyderabad pricing (MVAG 2025):**

| Mode | Base fare | Per-km | Passengers |
|------|-----------|--------|-----------|
| Bike | ₹40 for first 3 km | ₹8/km after | 1 only |
| Auto | ₹29 base + ₹13/km | after first km | 1–2 |
| Cab Mini | ₹80 for first 4 km | ₹15/km after | any |
| Cab Sedan | ₹100 for first 5 km | ₹18/km after | any |
| Metro | ≤2→₹10, ≤4→₹15, ≤8→₹20, ≤16→₹30, >16→₹60 | — | any |
| Bus | ≤5→₹10, ≤10→₹20, >10→₹30 | — | any |

**MVAG 2025 surge pricing:**

| Mode | Rain | Peak weekday (8–10am, 6–9pm) | Weekend night (Fri/Sat 10pm–2am) |
|------|------|------------------------------|----------------------------------|
| Cab | 2.0x | 2.0x | 1.3x |
| Auto (app-based) | 1.5x | 1.3x | — |
| Bike | 1.8x | 1.5x | — |
| Metro / Bus | — | — | — |

### `demand.py`
- Maps (lat, lon) → nearest `AreaContext` → nearest `HyderabadZone` AC → `DemandPattern` row
- Returns `DemandInfo`: cancel_rate, driver_supply, booking_count, demand_score (0–1), risk_level
- Default fallback: AC 88 (high-volume default) when no mapping found
- `get_zone_name_for_location(session, lat, lon)` utility

---

## Phase 6 — Dependencies ✅

**File modified:** `backend/pyproject.toml` — 4 packages added to `[project] dependencies`:

```toml
"pandas>=2.0.0",
"numpy>=1.26.0",
"xgboost>=2.0.0",
"scikit-learn>=1.4.0",
```

**Requires Docker rebuild:**
```bash
docker compose up --build backend
```

---

## Key Decisions Made

| Decision | Resolution |
|----------|-----------|
| Google Maps vs Haversine | **Haversine locked in** — no API key, no billing, appropriate for prototype |
| ML model not available | **Graceful fallback** — Medium risk for all zones, rain → High. Model activates on restart when `.pkl` is added |
| ML model path | `backend/app/model/cancellation_model.pkl` — teammate pushes via GitHub |
| Auto surge | App-based project → MVAG 2025 light surge applies: 1.3x peak, 1.5x rain |
| Cab surge correction | Updated from 1.5x to 2.0x peak per MVAG 2025 |
| demand_patterns.csv source | **Copy only** from `ALL_CITIES_daily_stats_clean.csv` — do not regenerate from funnel JSON |
| psycopg driver | Use `psycopg[binary]` already installed — never add `psycopg2` or `psycopg2-binary` |
| Bulk insert strategy | Batches of 500 via `session.execute(insert(Model), batch)` for 8K+ stop rows |

---

## Pending Work

### Phase 4 — API Routes ❌
4 new route files to create in `backend/app/api/routes/`:

| File | Prefix | Endpoints |
|------|--------|-----------|
| `rides.py` | `/rides` | `POST /predict-cancellation`, `GET /route-reliability`, `GET /best-time-to-leave` |
| `transport_routes.py` | `/transport` | `GET /alternatives`, `POST /optimal-pickup`, `POST /journey-cost` |
| `weather_routes.py` | `/weather` | `GET /impact` |
| `commute_routes.py` | `/commute` | `POST /weekly-plan` |

### Phase 5 — Register Routes ❌
Append to `backend/app/api/main.py` (4 lines, existing lines untouched):
```python
from app.api.routes import rides, transport_routes, weather_routes, commute_routes

api_router.include_router(rides.router, prefix="/rides")
api_router.include_router(transport_routes.router, prefix="/transport")
api_router.include_router(weather_routes.router, prefix="/weather")
api_router.include_router(commute_routes.router, prefix="/commute")
```

---

## Full Startup Sequence (first time)

```bash
# 1. Generate data files (run once at project root)
python prepare_backend_data.py

# 2. Rebuild Docker image (needed because pyproject.toml changed)
docker compose up --build backend

# 3. Run Alembic migration inside container
docker compose exec backend alembic revision --autogenerate -m "add_citynexus_models"
docker compose exec backend alembic upgrade head

# 4. Seed all tables (run once, in order)
docker compose exec backend python app/scripts/seed_area_context.py
docker compose exec backend python app/scripts/seed_hyderabad_zones.py
docker compose exec backend python app/scripts/seed_demand_patterns.py
docker compose exec backend python app/scripts/seed_transport_stops.py

# 5. Normal development after this
docker compose watch
```
