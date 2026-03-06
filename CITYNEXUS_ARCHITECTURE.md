# CityNexus Architecture

## Overview

CityNexus predicts ride cancellation risk and recommends the best transport mode (cab/metro/auto/bus) for
Hyderabad commuters before they book. React frontend → FastAPI backend → XGBoost ML model + external APIs.

---

## Pipeline

```
[React Frontend]
   │  POST /api/recommend {origin, destination, passengers, time}
   ▼
[FastAPI Backend]
   ├─→ Google Maps API (distance, time for driving/transit)
   ├─→ PostgreSQL (zone features: metro_count, bus_density, traffic_risk)
   ├─→ Open-Meteo API (weather: rain status, temp)
   ├─→ XGBoost Model (cancellation probability)
   └─→ Pricing Calculator (cab/auto/metro/bus costs + surge)
   │
   ▼
[Response] {"recommended_mode": "metro", "options": [...], "cab_risk": "medium"}
```

---

## Data

**PostgreSQL (400 rows):**
- `zones` (15) — Hyderabad zone features (metro_count_1km, bus_stop_count_500m, traffic_chokepoint_nearby)
- `route_patterns` (225) — Historical cancellation rates (pickup_zone → drop_zone, by hour/day)
- `pricing_config` (4) — Cab/auto/metro/bus pricing formulas

**ML Model (backend filesystem):**
- `trained_model.pkl` — XGBoost (5MB, loaded at startup)
- `area_mapping.json` — Bengaluru area → Hyderabad zone type mapping

---

## API Endpoints

```
POST   /api/recommend                    Multi-modal recommendation
POST   /api/predict-cancellation         Cancellation risk only
GET    /api/weather                      Current weather
POST   /api/optimal-pickup-points        Better pickup spots nearby
POST   /api/commute-plan/weekly          7-day transport plan
```

---

## External APIs

| Service | Purpose | Cost |
|---------|---------|------|
| Google Maps Directions | Distance, time, routes | $5/1000 (28K free/month) |
| Google Places | POI search | $17/1000 |
| Open-Meteo | Weather | FREE |

**Cost per user:** ~$0.02

---

## ML Model

**XGBoost trained on 49,999 Bengaluru Ola rides.** 15 features (hour, zone_type, metro_count, bus_density,
traffic_risk, patterns). Target: is_cancelled (0/1). Performance: AUC 0.75-0.82, F1 0.65-0.72. Risk levels:
Low (<20%), Medium (20-50%), High (>50%). Weather rule: Rain → +30% risk, +0.5x surge.

---

## Demo Setup (No Deployment)

```
[Localhost:3000]       [Localhost:8000]              [SQLite File]
React dev server       FastAPI + XGBoost             demo.db (15 zones)
npm start              uvicorn main:app --reload     Single file, no server
```

**Setup Time:** 30 minutes | **Cost:** $0 (all local)

---

## Key Decisions

**Bengaluru → Hyderabad:** Learn patterns from 50K Bengaluru rides, apply to Hyderabad with 9K local transport points.
**15 zones:** Each ~1-3 km. Faster (<50ms), actionable. **Model in memory:** 5MB at startup. **Weather cached 15 min.**
**No auth V1:** Browser localStorage. **Single API:** One frontend call, backend orchestrates.

---

## Scalability

**Current:** 50-100 users, ~10 req/sec, 50ms inference (single instance)
**If needed:** 3-5 instances + Redis + dedicated ML service
**Demo scale:** Single instance sufficient for <1000 users
