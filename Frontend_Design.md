# CityNexus Frontend Design

## Tech Stack
- React 19 + TypeScript
- Vite
- TanStack Router (file-based routing)
- TanStack React Query
- Chakra UI
- Leaflet.js (City Heatmap)
- Recharts (Model Insights charts)

---

## Page Structure

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/_layout/` | Decision engine — input trip, get final answer |
| City Heatmap | `/_layout/heatmap` | City-wide risk and demand awareness |
| Model Insights | `/_layout/insights` | Model transparency and trust |
| Weekly Commute | `/_layout/weekly` | 7-day commute planning and cost forecasting |

---

## Page 1 — Dashboard (Decision Engine)

### Goal
User enters trip details once. Everything computes in parallel. A single final verdict appears at the top: **Go Now / Wait / Take Metro / Take Bus.** All supporting detail is below, organized into clean panels.

---

### Section 1 — Input Bar (Sticky Top)
A single horizontal form bar pinned to the top of the page.

**Fields:**
- Pickup location (text input with coordinates)
- Destination (text input with coordinates)
- Passengers (1–6 selector)
- Departure time (time picker, defaults to now)

**Button:** `Analyse My Trip`

On submit → fires all API calls in parallel.

---

### Section 2 — Final Decision Card (Appears immediately after input)

One bold card, full width, color-coded:

```
┌─────────────────────────────────────────────────────┐
│  RECOMMENDATION                                      │
│                                                      │
│  Take Metro from Ameerpet  →  Ideal. Low risk,      │
│  cheapest option, no surge right now.                │
│                                                      │
│  Risk: LOW   |   Cost: ₹35   |   Time: 28 min       │
│  Reliability Score: 8.4 / 10                        │
└─────────────────────────────────────────────────────┘
```

Color: Green (Low) / Yellow (Moderate) / Red (High)

**Data source:** Synthesized from `/rides/predict-cancellation` + `/transport/alternatives` + `/rides/route-reliability`

Logic: Pick the lowest-risk, lowest-cost available mode. If cab risk is Low and cost difference is minimal, recommend cab. If risk is High, always surface a transit alternative.

---

### Section 3 — Three-Column Detail Panel

Below the decision card, three columns side by side (stack on mobile).

#### Column A — Cancellation Risk
**Endpoint:** `POST /rides/predict-cancellation`

- Large gauge/dial: risk probability %
- Risk level badge: LOW / MODERATE / HIGH
- Factors list (demand score, driver supply, weather impact, area cancel rate)
- "Using ML model" or "Using fallback" indicator

#### Column B — Weather Right Now
**Endpoint:** `GET /weather/impact`

- Condition icon + label (e.g. Raining, Clear)
- Temperature (°C), wind speed
- Surge multiplier (e.g. ×1.4)
- Cancellation risk impact (e.g. +12%)

#### Column C — Route Reliability
**Endpoint:** `GET /rides/route-reliability`

- Score bar: 1–10 with label (Reliable / Moderate / Unreliable)
- Cancel rate for this route
- Avg wait time (minutes)
- Surge frequency
- Recommended modes list

---

### Section 4 — Transport Alternatives Table
**Endpoint:** `GET /transport/alternatives`

A clean comparison table. One row per available transport mode.

| Mode | Cost (₹) | Time (min) | Surge | Risk | Availability |
|------|----------|------------|-------|------|--------------|
| Metro | 35 | 28 | None | Low | ✓ |
| Auto | 120 | 22 | ×1.2 | Moderate | ✓ |
| Cab (Ola/Uber) | 180 | 20 | ×1.6 | High | ✓ |
| Bus | 25 | 45 | None | Low | ✓ |
| Bike taxi | 80 | 18 | ×1.1 | Low | ✓ |

Best option row is highlighted in green.

---

### Section 5 — Cost Breakdown
**Endpoint:** `POST /transport/journey-cost`

Horizontal bar chart comparing final cost per mode after surge.

Shows:
- Base cost
- Surge added
- Final cost
- Travel time

Cheapest option is labeled clearly.

---

### Section 6 — Best Time to Leave
**Endpoint:** `GET /rides/best-time-to-leave`

A timeline strip showing the next 6–12 hours, color-coded per hour slot:

```
Now    +1h    +2h    +3h    +4h    +5h    +6h
[RED]  [YEL]  [GRN]  [GRN]  [YEL]  [RED]  [RED]
High   Mod    Best   Good   Mod    High   High
```

Best time slot is marked with a star. Surge and risk shown on hover.

---

### Section 7 — Nearest Transit Stops
**Endpoint:** `POST /transport/optimal-pickup`

A small list (top 3–5 stops) showing:
- Stop name
- Type (Metro / MMTS / Bus)
- Walking distance + time
- Risk reduction %

Example:
```
Ameerpet Metro     Metro   350m  4 min walk   -28% cancellation risk
Punjagutta MMTS   MMTS    480m  6 min walk   -18% cancellation risk
```

---

---

## Page 2 — City Heatmap (City Awareness)

### Goal
Give the user a visual understanding of Hyderabad — where cancellations are high, where transit is strong, where to avoid at peak hours.

### Layout
Full-screen map (Leaflet.js) with a collapsible left sidebar for controls.

---

### Map Layers (toggle-able)

**Layer 1 — Cancellation Heatmap**
- Data: 25 constituency cancellation rates from `DemandPattern` table
- High cancel rate = red, low = green
- Gradient overlay across zones

**Layer 2 — Transport Stops**
- Data: 8,035 stops from `TransportStop` table
- Metro stops = blue pins
- MMTS stops = purple pins
- Bus stops = orange pins
- Clickable — shows stop name and type

**Layer 3 — Area Risk Zones**
- Data: 15 zones from `AreaContext` table
- Color-coded polygons by flood-prone, traffic density, commercial density
- Click for zone details panel

---

### Sidebar Controls
- Layer toggles (checkboxes for each layer)
- Hour filter slider (0–23) — updates heatmap to show demand at that hour
- Day of week selector — Mon to Sun
- Legend panel

---

### Info Panel (appears on map click)
When a zone or stop is clicked:
- Zone name
- Cancel rate at selected hour
- Demand score
- Nearby transit options count
- Risk level badge

---

## Page 3 — Weekly Commute (Plan Your Week)

### Goal
User enters their regular route once and gets a full 7-day commute plan — best mode per day, cost forecast, and risk outlook for the week.

### Layout
Single scroll page. Clean cards per day. Summary banner at the top.

---

### Section 1 — Input Form

**Fields:**
- Pickup location
- Destination
- Passengers (1–6)
- Usual departure time (HH:MM)

**Button:** `Plan My Week`

---

### Section 2 — Weekly Summary Banner

Appears after submit. Shows the week at a glance:

```
┌──────────────────────────────────────────────────────┐
│  Best mode this week: Metro                          │
│  Total estimated cost: ₹245   |   Avg risk: Low      │
│  Cheapest day: Wednesday  |  Riskiest day: Monday    │
└──────────────────────────────────────────────────────┘
```

---

### Section 3 — 7-Day Plan Table
**Endpoint:** `POST /commute/weekly-plan`

Full table, one row per day:

| Day | Date | Recommended Mode | Cost (₹) | Time (min) | Risk | Surge | Reason |
|-----|------|-----------------|----------|------------|------|-------|--------|
| Mon | Apr 7 | Auto | 110 | 22 | Moderate | ×1.2 | Morning peak demand |
| Tue | Apr 8 | Metro | 35 | 28 | Low | None | Low demand, reliable |
| Wed | Apr 9 | Metro | 35 | 28 | Low | None | Cheapest + safest |
| Thu | Apr 10 | Bike taxi | 80 | 18 | Low | ×1.1 | Fast, low risk |
| Fri | Apr 11 | Auto | 120 | 22 | Moderate | ×1.3 | Friday surge expected |
| Sat | Apr 12 | Cab | 150 | 20 | Low | ×1.0 | Weekend off-peak |
| Sun | Apr 13 | Metro | 35 | 28 | Low | None | Best value |

Risk column color-coded: green / yellow / red.

---

### Section 4 — Cost Bar Chart

Horizontal bar chart showing cost per day side by side. Cheapest day bar is highlighted green.

---

### Section 5 — Risk Timeline

A simple 7-slot strip (Mon–Sun) showing risk level per day with color blocks. Gives a fast visual read of the week.

```
Mon    Tue    Wed    Thu    Fri    Sat    Sun
[YEL]  [GRN]  [GRN]  [GRN]  [YEL]  [GRN]  [GRN]
Mod    Low    Low    Low    Mod    Low    Low
```

---

## Page 4 — Model Insights (Trust & Transparency)

### Goal
Show how the prediction engine works. Make it academically rigorous and user-trustworthy.

### Layout
Single scroll page. No sidebar. Clean white cards.

---

### Section 1 — Model Status Banner

```
┌──────────────────────────────────────────────┐
│  ML Model: ACTIVE (XGBoost)                  │
│  Accuracy: 88.85%   |   Last retrained: —    │
│  Predictions served: [live count from DB]     │
└──────────────────────────────────────────────┘
```

If fallback model is active, banner turns yellow with a note.

---

### Section 2 — What Drives Predictions

Feature importance chart (horizontal bar chart, Recharts).

Top features ranked by importance:
- Time of day (hour)
- Historical cancel rate for area
- Driver supply score
- Weather conditions (is_raining, wind)
- Day of week
- Demand score
- Distance

Data sourced from XGBoost feature_importances_ stored in ml_model.py.

---

### Section 3 — Risk Level Distribution

Donut chart showing distribution of all predictions made:
- Low risk %
- Moderate risk %
- High risk %

Data: Count from `RidePrediction` table grouped by risk level.

---

### Section 4 — Confusion Matrix

2×2 grid showing model performance:
- True Positives (correctly predicted cancellations)
- True Negatives (correctly predicted completions)
- False Positives
- False Negatives

Styled as a heatmap grid. Darker = higher count.

---

### Section 5 — How a Prediction is Made

Step-by-step explainer (no code, plain language):

```
1. You enter pickup + destination + time
2. We find your area's historical cancel rate (by constituency + hour)
3. We fetch current weather from Open-Meteo API
4. We score driver supply and demand for your time slot
5. XGBoost combines these into a probability (0–100%)
6. We translate that into Low / Moderate / High
7. We surface the best alternative if risk is high
```

---

### Section 6 — Data Behind the Model

Small stats grid:

| Dataset | Records |
|---------|---------|
| Transport stops | 8,035 |
| Demand patterns | By 25 constituencies × 24 hours × 7 days |
| Area zones | 15 |
| Calibration constituencies | 25 |
| Predictions made (live) | [from DB] |

---

## Navigation

Sidebar (existing Chakra UI sidebar) updated with four links:

- Dashboard (home icon)
- City Heatmap (map icon)
- Weekly Commute (calendar icon)
- Model Insights (chart icon)

Active page is highlighted. Sidebar collapses on mobile.

---

## API Call Strategy

All Dashboard calls fire in parallel on form submit using `Promise.all` via React Query.

| Call | Hook | Trigger |
|------|------|---------|
| `POST /rides/predict-cancellation` | `usePredictCancellation` | On submit |
| `GET /rides/route-reliability` | `useRouteReliability` | On submit |
| `GET /rides/best-time-to-leave` | `useBestTime` | On submit |
| `GET /transport/alternatives` | `useAlternatives` | On submit |
| `POST /transport/journey-cost` | `useJourneyCost` | On submit |
| `POST /transport/optimal-pickup` | `useOptimalPickup` | On submit |
| `GET /weather/impact` | `useWeatherImpact` | On page load (cached 15 min) |

Weekly Commute page fires separately on its own submit:

| Call | Hook | Trigger |
|------|------|---------|
| `POST /commute/weekly-plan` | `useWeeklyPlan` | On Weekly Commute form submit |

Loading states: skeleton placeholders per panel. No full-page spinner.

---

## Color System

| State | Color |
|-------|-------|
| Low risk / Good | Green (#38A169) |
| Moderate risk | Yellow (#D69E2E) |
| High risk | Red (#E53E3E) |
| Primary UI | Blue (#3182CE) |
| Background | Gray (#F7FAFC) |
| Cards | White |

---

## Build Order

1. Update sidebar navigation (add Heatmap, Weekly Commute, Insights links)
2. Build Dashboard — input bar + final decision card + all panels
3. Build City Heatmap page with Leaflet + layer toggles
4. Build Weekly Commute page — form, 7-day table, cost chart, risk strip
5. Build Model Insights page with charts

---
