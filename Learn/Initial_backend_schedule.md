# CityNexus — Initial Backend Build Schedule

**Date created:** 2026-03-27
**Scope:** Complete backend for AI ride intelligence — 6 DB models, 5 service files, 8 API endpoints

---

## Known Issues & Resolutions

| # | Issue | Resolution |
|---|-------|------------|
| 1 | **outputs/ folder path unknown** | One-time data prep script generates all needed CSVs from `cleaned_data/` and saves to `backend/app/data/` (inside Docker context). `demand_patterns.csv` already exists — just copy it. |
| 2 | **Alembic migrations required** | After adding models to `models.py`, generate migration with `alembic revision --autogenerate` and run `alembic upgrade head` inside Docker. Tables must exist in Supabase before seeding. |
| 3 | **Data upload scripts needed** | One-time seeder scripts built per table. Run once manually after migrations. Each script is idempotent (skips if data already exists). |
| 4 | **psycopg driver — do NOT use psycopg2** | All new dependencies in `pyproject.toml` must use `psycopg[binary]` (already installed). Never add `psycopg2` or `psycopg2-binary`. |
| 5 | **Google Maps API vs estimates — DECIDED** | **Haversine estimates with mode speed assumptions.** No API key, no billing, appropriate for prototype. This is locked in — not changing during implementation. |
| 6 | **ML model handled by teammate** | Model is already trained. Teammate will push `cancellation_model.pkl` to GitHub. Agreed path: `backend/app/model/cancellation_model.pkl`. ML service must handle missing file gracefully with rule-based fallback until model is synced. |

---

## Build Order

### Phase 0 — Data Preparation
**Goal:** Get all backend-ready CSV files into `backend/app/data/` before writing any feature code.

- [ ] **Write `prepare_backend_data.py`** at project root
- [ ] **Run it once**, commit `backend/app/data/` to Git so Docker always has these files

**What the script does:**

| Output file | Source | Action | Notes |
|-------------|--------|--------|-------|
| `transport_layer.csv` | `cleaned_data/metro_stations_clean.csv` + `bus_stops_clean.csv` + `mmts_stops_clean.csv` | Generate — merge all stops, add `stop_type` column | ~8,036 rows |
| `area_context.csv` | `cleaned_data/hyderabad_zones_features.csv` | Generate — rename columns to match DB model | 15 rows |
| `demand_patterns.csv` | Already exists — source is `cleaned_data/ALL_CITIES_daily_stats_clean.csv` | **Copy only** — do not regenerate | Pre-prepared |
| `Calibration_HYDERABAD_constituency_funnel.csv` | `cleaned_data/HYDERABAD_constituency_funnel.json` | Generate — flatten JSON, extract cancel rates per AC | 25 rows |

---

### Phase 1 — Database Models
**Goal:** 6 new tables defined in code, Supabase schema updated.

**File to modify:** `backend/app/models.py` — append to bottom only, do NOT touch existing User/Item models.

| Model | Key fields |
|-------|-----------|
| `TransportStop` | id, name, latitude, longitude, stop_type (`metro`/`bus`/`mmts`), zone_name |
| `AreaContext` | id, zone_name, latitude, longitude, metro_count_1km, bus_stop_count_1km, traffic_chokepoint_nearby, commercial_density_1km, is_flood_prone, nearest_metro_distance_km, risk_level (`medium`/`high`) |
| `DemandPattern` | id, constituency_num, hour_of_day, day_of_week, cancel_rate, booking_count, driver_supply |
| `HyderabadZone` | id, zone_name, ac_number, latitude, longitude, base_cancel_rate, risk_level (`medium`/`high`), search_to_estimate_rate, estimate_to_quote_rate |
| `RidePrediction` | id, user_id (nullable FK → User), origin_lat, origin_lon, dest_lat, dest_lon, predicted_risk, probability, is_raining, created_at |
| `UserSearch` | id, user_id (nullable FK → User), origin_name, dest_name, origin_lat, origin_lon, dest_lat, dest_lon, recommended_mode, created_at |

**After adding models — run inside Docker:**
```bash
docker compose exec backend alembic revision --autogenerate -m "add_citynexus_models"
docker compose exec backend alembic upgrade head
```

---

### Phase 2 — Data Seeders (One-Time Scripts)
**Goal:** Supabase tables populated with Hyderabad transport + zone data.

Scripts location: `backend/app/scripts/` (new folder with `__init__.py`)

| Script | Reads | Populates | Approx rows |
|--------|-------|-----------|-------------|
| `seed_area_context.py` | `backend/app/data/area_context.csv` | `AreaContext` | 15 |
| `seed_hyderabad_zones.py` | `backend/app/data/Calibration_HYDERABAD_constituency_funnel.csv` | `HyderabadZone` | 25 |
| `seed_demand_patterns.py` | `backend/app/data/demand_patterns.csv` | `DemandPattern` | varies |
| `seed_transport_stops.py` | `backend/app/data/transport_layer.csv` | `TransportStop` | ~8,036 |

**Rules:**
- Each script checks if data already exists → skips if yes (idempotent, safe to re-run)
- Must run in this order (zones before patterns)

**Run commands:**
```bash
docker compose exec backend python app/scripts/seed_area_context.py
docker compose exec backend python app/scripts/seed_hyderabad_zones.py
docker compose exec backend python app/scripts/seed_demand_patterns.py
docker compose exec backend python app/scripts/seed_transport_stops.py
```

---

### Phase 3 — Service Layer
**Goal:** Business logic isolated in services, reusable across all routes.

Location: `backend/app/services/` (new folder with `__init__.py`)

| File | Responsibility | External call? |
|------|---------------|----------------|
| `ml_model.py` | Load `.pkl` at startup from `backend/app/model/cancellation_model.pkl`. `predict(features) → (probability, risk_level)`. If model file missing → fallback to rule-based: all zones Medium, rain escalates to High | No |
| `weather.py` | Fetch Open-Meteo for Hyderabad (17.385, 78.486). Cache result 15 min. Return `{is_raining, temperature, windspeed}` | Yes — Open-Meteo (free, no API key) |
| `transport.py` | Haversine nearest-stop finder. `find_nearest(lat, lon, stop_type, radius_km) → list[stops]`. Used for metro, bus, MMTS proximity | No |
| `cost.py` | `calculate_cost(mode, distance_km, hour, is_raining, day_of_week) → {cost_inr, surge_multiplier}` for all 4 modes | No |
| `demand.py` | Return demand score + historical cancel rate by zone + hour from `DemandPattern` table | No |

**Pricing formulas baked into `cost.py`:**
```
Cab:   (50 + distance_km × 15) × surge
       Surge: 1.5x peak (8–10am, 6–9pm weekday) | 2.0x rain | 1.3x weekend night
Auto:  25 + max(0, distance_km − 1) × 15   [no surge in Hyderabad]
Metro: ≤2km → ₹10 | ≤4km → ₹15 | ≤8km → ₹20 | >8km → ₹30
Bus:   ≤5km → ₹10 | ≤10km → ₹20 | >10km → ₹30
```

**Distance calculation in `transport.py` (Haversine, locked in):**
```
Travel time estimates by mode:
  Cab:   distance_km / 25 km/h (peak) or / 35 km/h (off-peak) × 60 = minutes
  Auto:  distance_km / 20 km/h × 60 = minutes
  Metro: distance_km / 40 km/h × 60 + 8 min (walk + wait) = minutes
  Bus:   distance_km / 15 km/h × 60 + 10 min (wait) = minutes
```

**Risk calibration baked into `ml_model.py`:**
```
Hyderabad-specific rule: all zones are Medium or High (no Low risk zones)
Rain escalation: Medium → High
Probability thresholds: Low <20% | Medium 20–50% | High >50%
```

---

### Phase 4 — API Routes
**Goal:** 8 endpoints across 4 new route files.

Location: `backend/app/api/routes/` — new files only, never edit existing files.

#### `rides.py` — prefix `/rides`, tag `rides`
| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| `POST` | `/rides/predict-cancellation` | origin_zone, dest_zone, hour, day_of_week, month, is_raining | risk_level, probability, factors[] |
| `GET` | `/rides/route-reliability` | origin_zone, dest_zone (query params) | score (1–10), label, cancel_rate, avg_wait_min, surge_frequency |
| `GET` | `/rides/best-time-to-leave` | origin_zone, dest_zone, current_time (query params) | slots[] — each has: time, color (green/yellow/red), cancel_risk, surge |

#### `transport_routes.py` — prefix `/transport`, tag `transport`
| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| `GET` | `/transport/alternatives` | origin_lat, origin_lon, dest_lat, dest_lon, passengers, datetime (query params) | options[] for cab/auto/metro/bus — time_min (Haversine estimate), cost_inr, risk, reliability_score, reason |
| `POST` | `/transport/optimal-pickup` | origin_lat, origin_lon, radius_m (default 500) | suggestions[] — name, stop_type, distance_m, walk_min, risk_reduction_pct |
| `POST` | `/transport/journey-cost` | origin_lat, origin_lon, dest_lat, dest_lon, datetime | cost breakdown for all 4 modes with surge multiplier shown |

#### `weather_routes.py` — prefix `/weather`, tag `weather`
| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| `GET` | `/weather/impact` | none (uses Hyderabad fixed coords) | is_raining, temperature, windspeed, risk_impact (e.g. "Rain detected — all Medium zones escalated to High") |

#### `commute_routes.py` — prefix `/commute`, tag `commute`
| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| `POST` | `/commute/weekly-plan` | origin_lat, origin_lon, dest_lat, dest_lon, passengers, departure_time (HH:MM) | weekly_plan[] — 7 days, each with: date, day_name, recommended_mode, cost_inr, risk_level, reason |

---

### Phase 5 — Register Routes
**Goal:** All 4 new routers wired into the app.

**File to modify:** `backend/app/api/main.py` — append only, do NOT modify existing lines.

```python
from app.api.routes import rides, transport_routes, weather_routes, commute_routes

api_router.include_router(rides.router, prefix="/rides")
api_router.include_router(transport_routes.router, prefix="/transport")
api_router.include_router(weather_routes.router, prefix="/weather")
api_router.include_router(commute_routes.router, prefix="/commute")
```

---

### Phase 6 — Dependencies
**Goal:** All required packages declared in `pyproject.toml`.

**File to modify:** `backend/pyproject.toml` — add to `[project] dependencies` only.

```toml
"pandas>=2.0.0",
"numpy>=1.26.0",
"xgboost>=2.0.0",
"scikit-learn>=1.4.0",
```

**Do NOT add:**
- ~~`psycopg2`~~ or ~~`psycopg2-binary`~~ — conflicts with existing `psycopg[binary]`
- ~~`requests`~~ — use `httpx` already installed via `fastapi[standard]`
- ~~`googlemaps`~~ — decided against Google Maps, using Haversine

---

## Full Dependency Chain

```
Phase 0  →  Phase 1  →  Phase 2  →  Phase 3  →  Phase 4  →  Phase 5
(data)      (models)    (seed DB)   (services)  (routes)    (wire up)
                                                              ↑
                                                         Phase 6 (deps)
                                                         can run anytime
```

---

## Docker Workflow Reference

```bash
# Normal development (auto-syncs code changes):
docker compose watch

# After changing pyproject.toml (needs full rebuild):
docker compose up --build backend

# After adding new models (run once):
docker compose exec backend alembic revision --autogenerate -m "add_citynexus_models"
docker compose exec backend alembic upgrade head

# Seed data (run once after migrations):
docker compose exec backend python app/scripts/seed_area_context.py
docker compose exec backend python app/scripts/seed_hyderabad_zones.py
docker compose exec backend python app/scripts/seed_demand_patterns.py
docker compose exec backend python app/scripts/seed_transport_stops.py
```

---

## New Files Checklist

```
CityNexus/
├── prepare_backend_data.py                      ← Phase 0
├── backend/
│   └── app/
│       ├── model/
│       │   └── cancellation_model.pkl           ← pushed by teammate via GitHub
│       ├── data/                                ← generated by prepare_backend_data.py
│       │   ├── transport_layer.csv              ← generated (merged stops)
│       │   ├── area_context.csv                 ← generated (renamed zone features)
│       │   ├── demand_patterns.csv              ← COPIED (already exists, source: ALL_CITIES_daily_stats_clean.csv)
│       │   └── Calibration_HYDERABAD_constituency_funnel.csv  ← generated (flattened JSON)
│       ├── services/
│       │   ├── __init__.py
│       │   ├── ml_model.py
│       │   ├── weather.py
│       │   ├── transport.py
│       │   ├── cost.py
│       │   └── demand.py
│       ├── scripts/
│       │   ├── __init__.py
│       │   ├── seed_area_context.py
│       │   ├── seed_hyderabad_zones.py
│       │   ├── seed_demand_patterns.py
│       │   └── seed_transport_stops.py
│       └── api/routes/
│           ├── rides.py                         ← new
│           ├── transport_routes.py              ← new
│           ├── weather_routes.py                ← new
│           └── commute_routes.py                ← new

Modified files (append only):
├── backend/app/models.py                        ← 6 models appended at bottom
├── backend/app/api/main.py                      ← 4 router lines appended at bottom
└── backend/pyproject.toml                       ← 4 packages appended to dependencies
```
