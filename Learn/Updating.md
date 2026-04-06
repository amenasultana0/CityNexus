# CityNexus — Updating.md
> One-by-one fix tracker. Status: [ ] Pending | [~] In Progress | [x] Done

---

## USER-REPORTED ISSUES

---

### U1 — Personalization [ ]
**Problem:** The app is completely stateless. Every user gets the same results for the same inputs. No preference memory, no saved locations, no history.

**What's missing:**
- No "Home" / "Work" saved locations
- No preferred transport mode storage
- No budget preference (cheap vs fast)
- No risk tolerance setting (cautious vs adventurous)
- No history of past trips shown back to user

**Files to change:**
- `backend/app/models.py` — add `UserPreference` and `SavedLocation` tables
- `backend/app/api/routes/users.py` — add GET/PATCH `/me/preferences`, GET/POST `/me/locations`
- `backend/app/crud.py` — add CRUD helpers for preferences
- `frontend/src/routes/_layout/settings.tsx` — add Preferences tab (home, work, preferred mode, budget cap)
- `frontend/src/routes/_layout/index.tsx` — autofill pickup/dest from saved locations; respect preferred mode in sorting

**Fix plan:**
1. Add `UserPreference` model: `preferred_mode`, `max_budget_inr`, `risk_tolerance` (low/medium/high)
2. Add `SavedLocation` model: `label` (Home/Work/Other), `address_text`, `lat`, `lon`
3. Wire backend endpoints (protected, requires JWT)
4. Settings page: new "Preferences" tab with dropdowns + saved location manager
5. Dashboard: show saved location shortcuts below input box ("Go Home", "Go to Work")
6. Sort transport alternatives: respect preferred mode by boosting its rank; filter out modes above budget cap

---

### U2 — Complete Address [ ]
**Problem:** The geocoder accepts vague names like "Ameerpet" but never shows the full resolved address back to the user. User doesn't know what exact location was matched.

**What's missing:**
- No display of resolved address after typing
- No reverse geocoding (lat/lon → readable address)
- No address autocomplete suggestions while typing
- No confirmation step ("Did you mean: Ameerpet Metro Station, Hyderabad?")
- Nominatim returns a `display_name` field that is currently ignored

**Files to change:**
- `frontend/src/routes/_layout/index.tsx` — show resolved address below input after geocode
- `frontend/src/routes/_layout/weekly.tsx` — same
- `frontend/src/lib/api.ts` — update `geocode()` to return `display_name` from Nominatim
- (Optional) Add debounced autocomplete dropdown using Nominatim `/search?format=json&q=...`

**Fix plan:**
1. Update `geocode()` in `api.ts` to return `{ lat, lon, displayName }` (Nominatim already returns `display_name`)
2. After geocoding, show a small grey text under the input: *"Matched: Ameerpet Metro Station, Hyderabad, Telangana"*
3. If geocoding fails, show inline error in red: *"Location not found — try a more specific name"*
4. Add debounced autocomplete: as user types ≥3 chars, call Nominatim `/search` and show dropdown suggestions (5 max)
5. Weekly planner: same changes

---

### U3 — Double Check [ ]
**Problem:** There is no confirmation or verification step before running analysis. Users can submit garbage inputs and get misleading results. No input validation beyond "location not found".

**What's missing:**
- No distance sanity check (e.g., pickup = destination)
- No Hyderabad boundary check (user could type "Mumbai")
- No passenger count validation (0 or very high values)
- No time format validation
- No warning if departure time is in the past

**Files to change:**
- `frontend/src/routes/_layout/index.tsx` — add pre-submit validation
- `frontend/src/routes/_layout/weekly.tsx` — add pre-submit validation
- `backend/app/api/routes/transport_routes.py` — add Pydantic validators
- `backend/app/api/routes/commute_routes.py` — add validators

**Fix plan:**
1. Frontend validation before API call:
   - Pickup ≠ Destination (compare resolved lat/lon within 100m)
   - Both locations within Hyderabad bounding box: lat 17.1–17.8, lon 78.1–78.8
   - Passengers: 1–6 (auto/bike limit = 1, cab = 4, bus/metro = any)
   - Time: valid HH:MM format
   - If departure_time is in the past today: warn "This time has passed — showing current conditions"
2. Backend Pydantic validators:
   - `lat` must be in [17.0, 18.0], `lon` in [78.0, 79.0]
   - `passengers` must be 1–6
3. Show validation errors as toast notifications (red, top-right)

---

### U4 — Cost Sahi Nai Hai (Cost is Wrong) [ ]
**Problem:** Several cost calculation issues make prices unrealistic or inaccurate.

**Known issues found in `services/cost.py`:**
- **Bike** cost is calculated even for `passengers > 1` — bike can carry only 1 person, should be disabled
- **Auto** surge is applied uniformly but Hyderabad autos mostly don't have meters — should flag as "negotiated"
- **Metro** flat bands don't reflect actual HMRL fare chart (e.g., 0–2 km = ₹10 but metro min actual fare is ₹10 regardless of distance for short trips — that part is fine, but long-distance bands may be off)
- **Bus (TSRTC)** fare of ₹30 for >10 km is too low — Volvo/Express buses charge more
- **Cab surge** during rain is 2.0x flat — in reality Ola/Uber surge is dynamic and can be 1.2x to 3.0x
- **No waiting charges** — autos/cabs charge waiting time in traffic
- **Weekly plan** cost doesn't multiply by 2 for return trip (only shows one-way)

**Files to change:**
- `backend/app/services/cost.py` — fix formulas
- `backend/app/api/routes/transport_routes.py` — add `passengers` validation per mode
- `frontend/src/routes/_layout/index.tsx` — add "one-way / round trip" toggle
- `frontend/src/routes/_layout/weekly.tsx` — multiply cost by 2 if round_trip=True

**Fix plan:**
1. Disable bike if `passengers > 1` — remove from alternatives list, add note "Bike: not available for 2+ passengers"
2. Add "negotiated fare" flag to auto — show as "₹X–₹Y (estimated, negotiate with driver)"
3. Add "one-way / round trip" toggle in both dashboard and weekly planner; multiply total by 2 for round trip
4. Weekly plan: default to round trip (go + return = 2x daily cost), show as "Daily (round trip): ₹X"
5. Add traffic-based waiting charge for cab/auto: if peak hour, add ₹15–₹30 estimate
6. Review HMRL fare chart and update metro bands if off

---

### U5 — Bus/Metro: Show Stops [ ]
**Problem:** When user selects Bus or Metro as their mode, the app recommends it but doesn't tell them:
- Which specific stop to board from
- Which stop to get off at
- How many stops in between
- Route number (for bus)
- Line name (for metro — Red Line, Blue Line, etc.)

**Files to change:**
- `backend/app/api/routes/transport_routes.py` — enhance `/alternatives` to include nearest stops for bus/metro
- `backend/app/services/transport.py` — add `find_nearest_stop_pair(origin, dest, mode)` function
- `frontend/src/routes/_layout/index.tsx` — show stop details in transport alternatives card

**Fix plan:**
1. In `transport.py`, add `find_nearest_stop_pair()`:
   - Find nearest metro/bus stop to origin (boarding stop)
   - Find nearest metro/bus stop to destination (alighting stop)
   - Return: `{ boarding: {name, lat, lon, walk_m}, alighting: {name, lat, lon, walk_m} }`
2. In `/alternatives` response, add `stop_details` field for metro and bus:
   ```json
   {
     "mode": "metro",
     "stop_details": {
       "board_at": "Ameerpet Metro Station (250m walk)",
       "alight_at": "HITEC City Metro Station (180m walk)",
       "line": "Blue Line"
     }
   }
   ```
3. Frontend: below the metro/bus row in alternatives table, show a small expandable section with stop info
4. Optimal Pickup panel already shows nearby stops — link to it from the alternatives card

---

### U6 — City Heatmap Fix [ ]
**Problem:** The heatmap is visually appealing but factually incorrect in several ways:

**Issues:**
- Zones are drawn as squares — not real constituency/ward boundaries
- 15 hardcoded zones with fixed `baseCancelRate` values — not fetched from backend DB
- Day selector (Mon–Sun) is decorative — doesn't change any rates
- Hour slider changes rates but with a made-up multiplier formula (not from real demand data)
- Transit stop locations on the heatmap are approximated using offset from zone center — not real coordinates

**Files to change:**
- `frontend/src/routes/_layout/heatmap.tsx` — major rework
- `backend/app/api/routes/` — add `/heatmap/zones` endpoint returning live zone data
- `backend/app/api/routes/` — add `/heatmap/stops?zone=X` returning actual stop coordinates

**Fix plan:**
1. **Backend:** Add `GET /api/v1/heatmap/zones?hour=8&day=Monday` endpoint:
   - Query `AreaContext` + `DemandPattern` tables
   - Return: `[{ zone_name, lat, lon, cancel_rate, risk_level, area_sqkm }]`
   - Apply actual hourly demand pattern multipliers from `DemandPattern` table
2. **Backend:** Add `GET /api/v1/heatmap/stops?lat=X&lon=Y&radius=2000` endpoint returning actual stop coordinates
3. **Frontend:** Replace hardcoded `ZONES` array — fetch from `/heatmap/zones?hour=<slider>&day=<selected>`
4. **Frontend:** Day selector now sends `day=Monday` etc. to backend — rates will actually change
5. **Frontend:** Re-fetch zone data whenever hour slider or day changes (debounced 300ms)
6. **Frontend:** Use actual stop lat/lon from database (not offset approximation)
7. Boundary fix: replace square polygons with circles of appropriate radius (or keep squares but size from `area_sqkm` data)

---

### U7 — Weekly Heatmap Date Add [ ]
**Problem:** The weekly planner table shows "Sunday", "Monday" etc. but doesn't show the actual calendar date for each day. User can't tell which Monday or what date is being referenced.

**Files to change:**
- `frontend/src/routes/_layout/weekly.tsx` — add date column

**Fix plan:**
1. Backend already returns `"date": "2026-04-05"` in each weekly plan entry — it's just not displayed in frontend
2. In the weekly table, update the "Day" column to show:
   `Sunday  Apr 6` (day name + short date)
3. In the risk strip, add date labels below each colored box
4. Summary cards: "Cheapest Day" and "Riskiest Day" should show the date too (e.g., "Wednesday, Apr 9")
5. Chart x-axis: use `"Mon\nApr 7"` format instead of just day name

---

## DISCOVERED ISSUES (Not Reported by User)

---

### D1 — ML Model Missing: Always Fallback [ ]
**Problem:** `backend/app/model/cancellation_model.pkl` does not exist in the repo. Every prediction uses the rule-based fallback. The Insights page shows "XGBoost ACTIVE" but it's likely never actually active.

**Fix plan:**
1. Check if `.pkl` is gitignored — if so, add instructions in `DEMO_SETUP_GUIDE.md` to train it
2. Add a startup check: if `.pkl` missing, log a warning at boot (not silent fallback)
3. In `ml_model.py`, fix the model status endpoint to honestly report `"fallback"` vs `"ml_active"`
4. Frontend Insights page: don't show "XGBoost ACTIVE" if backend reports fallback
5. Consider adding a simple training script `train_model.py` to generate the `.pkl` from seed data

---

### D2 — Weekly Plan Uses Today's Weather for All 7 Days [ ]
**Problem:** `commute_routes.py` calls `get_weather()` once and applies it to all 7 days. Monday's forecast is used for Sunday. Inaccurate.

**Fix plan:**
1. Open-Meteo free tier supports 7-day hourly forecasts — use `/forecast?hourly=weathercode,precipitation`
2. In `weather.py`, add `get_weekly_forecast()` returning `{ date → WeatherResult }` for next 7 days
3. In `commute_routes.py`, map each day to its forecasted weather
4. Cache weekly forecast for 1 hour (not 15 min like current)

---

### D3 — Insights Page Has Hardcoded Static Numbers [ ]
**Problem:** Feature importance (0.22, 0.19...), confusion matrix (TP=1821...), and risk distribution (38%, 41%, 21%) are hardcoded constants. They never change, even if the model is retrained.

**Fix plan:**
1. Add `GET /api/v1/rides/model-stats` endpoint that reads from the `.pkl` file's metadata or a `model_stats.json` sidecar
2. If fallback mode, return estimated numbers with a `"source": "estimated"` flag
3. Frontend: fetch from API instead of using `const FEATURE_IMPORTANCE = [...]`
4. Show "Last updated: [date]" on Insights page

---

### D4 — No Rate Limiting on Auth Endpoints [ ]
**Problem:** `/login/access-token`, `/users/` (signup), `/login/password-recovery/{email}` have no rate limiting. Vulnerable to brute force and enumeration.

**Fix plan:**
1. Add `slowapi` (FastAPI rate limiter) to backend dependencies
2. Apply: `@limiter.limit("5/minute")` on login, `@limiter.limit("3/minute")` on password-recovery
3. Return `429 Too Many Requests` on breach

---

### D5 — Email Enumeration via Password Recovery [ ]
**Problem:** `GET /password-recovery/{email}` returns different responses depending on whether the email exists, allowing attackers to enumerate valid accounts.

**Fix plan:**
1. Always return `{"message": "If this email exists, a recovery link was sent"}` regardless
2. Send email only if account exists (internal logic unchanged), but normalize the HTTP response

---

### D6 — JWT Stored in localStorage (XSS Risk) [ ]
**Problem:** JWT token is stored in `localStorage`, accessible by any JavaScript on the page. XSS attack can steal tokens.

**Fix plan:**
1. Move JWT to `httpOnly` cookie (requires backend to set `Set-Cookie` header)
2. Update `useAuth.ts` to not manually store token — rely on cookie
3. Add `SameSite=Strict` and `Secure` flags
4. This is a significant auth refactor — do after other fixes

---

### D7 — Passengers Not Validated Per Mode [ ]
**Problem:** User can request 5 passengers for a bike ride. Backend returns a cost but it's nonsensical. Each mode has real capacity limits:
- Bike: 1 passenger
- Auto: 1–2 passengers (legal limit 3 in India)
- Cab Mini: 1–3 passengers
- Cab Sedan: 1–4 passengers
- Metro/Bus: unlimited (cost per head)

**Fix plan:**
1. In `cost.py`, add `MAX_PASSENGERS` per mode dict
2. If `passengers > max`, either return `null` for that mode (unavailable) or auto-calculate multiple trips
3. Frontend: grey out / disable modes that can't fit the passenger count
4. Show tooltip: "Bike: max 1 passenger"

---

### D8 — No Loading States on Heatmap & Weekly [ ]
**Problem:** Heatmap fetches stop data for 5 zones on mount. Weekly page fetches 7-day plan. Both have no loading skeleton — UI just appears empty or partially rendered.

**Fix plan:**
1. Add `<Skeleton>` components (Chakra UI) while data is loading
2. Heatmap: show "Loading transit data..." overlay on map until stops are fetched
3. Weekly: show skeleton rows in the table while plan is being fetched

---

### D9 — Error States Not Handled in Frontend [ ]
**Problem:** If backend is down or returns an error, most frontend components silently fail or show a blank screen. No user-facing error messages.

**Fix plan:**
1. Wrap API calls in try/catch and show `<Alert status="error">` from Chakra UI
2. Dashboard: "Unable to fetch weather data — using default conditions"
3. Weekly: "Could not generate weekly plan — please try again"
4. Heatmap: "Transit data unavailable — showing map only"

---

### D10 — CORS Too Permissive [ ]
**Problem:** CORS config potentially allows all origins. Should be locked to known frontend origin in production.

**Fix plan:**
1. In `backend/app/core/config.py`, verify `BACKEND_CORS_ORIGINS` is set in production env
2. In `docker-compose.yml`, set `BACKEND_CORS_ORIGINS=https://citynexus.yourdomain.com`
3. Never use `["*"]` in production

---

### D11 — Analytics Data Collected But Never Shown [ ]
**Problem:** `RidePrediction` and `UserSearch` tables are written to on every prediction. But there's no analytics dashboard to view trends, popular routes, peak usage times, etc. Data is being wasted.

**Fix plan:**
1. Add `GET /api/v1/analytics/summary` endpoint (superuser only):
   - Total predictions today/week
   - Most common origin zones
   - Risk distribution over time
   - Average cost per mode
2. Add Analytics tab in admin panel showing charts (Recharts, reuse existing setup)

---

### D12 — Heatmap Day Selector is Non-Functional [ ]
**Problem:** Day buttons (Mon–Sun) in heatmap have `onClick` that sets `selectedDay` state but this state is never used in the cancellation rate calculation. It's purely decorative UI.

*This is also covered in U6 — will be fixed there.*

---

### D13 — No "About This City" Context [ ]
**Problem:** A new user has no idea why certain zones are high-risk. There's no explanation of what affects cancellation rates.

**Fix plan:**
1. Add a collapsible "About the Data" panel on the heatmap page
2. Short explanation: "Cancellation rates are based on historical Ola/Uber data for Hyderabad, cross-referenced with weather and traffic patterns."
3. On Insights page, link to methodology

---

### D14 — Seats/Passengers Not Shown in Cost Breakdown [ ]
**Problem:** When `passengers > 1`, cost doubles for cab (or should). But the UI just shows total cost without explaining it's per-trip or per-person. Confusing.

**Fix plan:**
1. Add "Per person" vs "Total" toggle in cost breakdown chart
2. Show footnote: "Costs shown are per trip (not per person) unless noted"
3. For metro/bus, show "₹X × 2 passengers = ₹Y"

---

### D15 — Default Secrets in .env [ ]
**Problem:** `SECRET_KEY=changethis` and `FIRST_SUPERUSER_PASSWORD=changethis` are default values that are insecure if deployed without change.

**Fix plan:**
1. Add a startup assertion: if `SECRET_KEY == "changethis"` and `ENV != "development"`, refuse to start
2. Add to `DEMO_SETUP_GUIDE.md`: "Generate a new SECRET_KEY with: `openssl rand -hex 32`"
3. Document password rotation procedure

---

## PRIORITY ORDER

| # | Issue | Priority | Difficulty | Impact |
|---|-------|----------|------------|--------|
| U4 | Cost fixes (round trip, bike disabled, wrong fares) | 🔴 High | Easy | High |
| U7 | Weekly date display | 🔴 High | Easy | Medium |
| U3 | Double-check / input validation | 🔴 High | Medium | High |
| U2 | Complete address display | 🔴 High | Easy | High |
| U5 | Show bus/metro stops | 🔴 High | Medium | High |
| D7 | Passenger limit per mode | 🔴 High | Easy | Medium |
| D8 | Loading states | 🟠 Medium | Easy | Medium |
| D9 | Error states | 🟠 Medium | Easy | Medium |
| U6 | City heatmap real data | 🟠 Medium | Hard | High |
| D2 | Weekly weather forecast | 🟠 Medium | Medium | Medium |
| D12 | Heatmap day selector fix | 🟠 Medium | Easy | Medium |
| U1 | Personalization | 🟡 Low | Hard | High |
| D1 | ML model training | 🟡 Low | Medium | Medium |
| D3 | Insights live stats | 🟡 Low | Medium | Low |
| D11 | Analytics dashboard | 🟡 Low | Hard | Medium |
| D4 | Rate limiting | 🔴 High | Easy | Security |
| D5 | Email enumeration fix | 🔴 High | Easy | Security |
| D6 | JWT → httpOnly cookie | 🟡 Low | Hard | Security |
| D10 | CORS lockdown | 🟠 Medium | Easy | Security |
| D15 | Default secrets check | 🟠 Medium | Easy | Security |
| D13 | About the data context | 🟡 Low | Easy | UX |
| D14 | Per-person cost display | 🟡 Low | Easy | UX |

---

## COMPLETION LOG

_(Fill in as fixes are implemented)_

| Issue | Fixed In | Notes |
|-------|----------|-------|
| — | — | — |
