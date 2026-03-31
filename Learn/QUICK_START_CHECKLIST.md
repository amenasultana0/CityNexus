# CityNexus - Quick Start Checklist
**Your 8-Week Roadmap at a Glance**

---

## ✅ DATA QUALITY VERDICT

### USE THESE:
- ✅ **Bengaluru_Ola_clean.csv** — Your PRIMARY training dataset (7.9 MB, 63K+ rides)
- ✅ **Bookings_clean.csv** — Additional booking data (19 MB)
- ✅ **hyderabad_zones_features.csv** — Zone context features (YOUR WORK)
- ✅ **All Hyderabad GIS data** — Metro, bus, traffic, etc. (YOUR WORK)

### SKIP THESE:
- ❌ **rides_clean.csv** — SYNTHETIC, only 3 columns, no useful data
- ❌ **HYDERABAD_driver_supply_clean.csv** — 53 rows, no time dimension, unreliable
- ❌ **HYDERABAD_ward_driver_supply_clean.csv** — Static snapshot, too sparse

---

## 🎯 FEATURES TO BUILD (Priority Order)

### TIER 1 - MUST BUILD (Weeks 1-4)
1. **Multi-Modal Alternative Suggester** ⭐⭐⭐
   - Show cab/auto/metro/bus with time, cost, cancellation risk
   - Recommend best option based on passenger count & preferences

2. **Cancellation Risk Score** ⭐⭐⭐
   - Low/Medium/High badge for cab bookings
   - ML-powered using XGBoost on Bengaluru data

3. **Journey Cost Estimator** ⭐⭐⭐
   - Exact cost for each transport mode
   - Includes predicted surge for cabs

4. **Weather Impact Indicator** ⭐⭐
   - Live weather from Open-Meteo API
   - Auto-adjust risk & surge if raining

### TIER 2 - NICE TO HAVE (Week 5, if time permits)
5. **Route Reliability Score** ⭐⭐
   - Score route out of 10 based on historical patterns

6. **Best Time To Leave** ⭐
   - Green/yellow/red timeline for next 2 hours

### TIER 3 - SKIP FOR V1
7. ❌ **Optimal Pickup Point** — No street-level data available
8. ❌ **Commute Planner** — Needs user auth system (too complex for V1)

---

## 📅 WEEK-BY-WEEK TASKS

### Week 1: Setup & Data
- [ ] Install Python, Node.js, PostgreSQL
- [ ] Get Google Maps API key
- [ ] Train XGBoost model on Bengaluru_Ola_clean.csv
- [ ] Load hyderabad_zones_features.csv into database
- [ ] Test Open-Meteo API

### Week 2: Backend
- [ ] Build FastAPI endpoints: /recommend, /predict_cancellation, /get_weather
- [ ] Integrate Google Maps Directions API
- [ ] Implement pricing formulas (cab, auto, metro, bus)
- [ ] Build recommendation ranking logic

### Week 3: Frontend
- [ ] Build route input form (Google Places autocomplete)
- [ ] Integrate Google Maps JS API (map display)
- [ ] Create results table (4 transport options)
- [ ] Build cancellation risk badge component

### Week 4: Integration
- [ ] Connect frontend to backend (Axios)
- [ ] Load ML model, test predictions
- [ ] Integrate weather API
- [ ] End-to-end testing

### Week 5: Tier 2 Features (optional)
- [ ] Route reliability score
- [ ] Best time to leave timeline

### Week 6: Polish
- [ ] Responsive design (mobile + desktop)
- [ ] Performance optimization
- [ ] User testing
- [ ] Documentation

### Week 7: Deployment
- [ ] Deploy backend to Render/Railway
- [ ] Deploy frontend to Vercel/Netlify
- [ ] Prepare presentation slides
- [ ] Record demo video

### Week 8: Final Polish
- [ ] Bug fixes
- [ ] Presentation rehearsal
- [ ] Final submission

---

## 🛠️ TECH STACK SUMMARY

**Backend:**
- FastAPI (Python web framework)
- XGBoost (ML model)
- PostgreSQL (database)
- SQLAlchemy (ORM)

**Frontend:**
- React (UI framework)
- Google Maps JavaScript API
- Axios (API calls)

**APIs:**
- Google Maps Directions API (routing)
- Google Places API (autocomplete)
- Open-Meteo API (weather - FREE)

**Deployment:**
- Backend: Render/Railway (free tier)
- Frontend: Vercel/Netlify (free tier)
- Database: Neon/Render PostgreSQL (free tier)

---

## 📊 ML MODEL CHEAT SHEET

**Training Data:**
- Source: Bengaluru_Ola_clean.csv
- Target: Booking_Status == "Cancelled by Driver" → 1, else 0
- Features: 15 (hour, day, zone features, historical patterns)

**Model:**
- Algorithm: XGBoost
- Expected AUC: 0.75-0.82
- Expected F1: 0.65-0.72

**Feature Engineering:**
```python
# Time features
- hour (0-23)
- day_of_week (0-6)
- is_weekend (0/1)
- is_peak_hour (0/1)

# Location features (from Hyderabad zones)
- metro_count_1km
- bus_stop_count_500m
- commercial_density_1km
- traffic_chokepoint_nearby
- is_flood_prone

# Historical features
- route_cancellation_rate
- zone_avg_cancellation
```

---

## 💰 PRICING FORMULAS (Hyderabad)

**Cab:**
```
Base: ₹50
Per km: ₹15
Surge: 1.0x - 2.5x (time-based)
  Peak hours (8-10 AM, 6-9 PM): 1.5x
  Rain: 2.0x
  Weekend nights: 1.3x
Total = (Base + Distance × PerKm) × Surge
```

**Auto:**
```
First km: ₹25
Per km after: ₹15
No surge in Hyderabad
Total = 25 + (Distance - 1) × 15
```

**Metro (HMRL):**
```
0-2 km: ₹10
2-4 km: ₹15
4-8 km: ₹20
8+ km: ₹30
```

**Bus:**
```
Flat rate: ₹10-30 based on distance
Short (<5 km): ₹10
Medium (5-15 km): ₹20
Long (>15 km): ₹30
```

---

## 🚨 PASSENGER LOGIC

**1-2 passengers:**
- Show: Cab, Auto, Bike, Metro, Bus

**3-4 passengers:**
- Show: Cab, Metro, Bus
- Remove: Bike, Auto (can't fit)

**5+ passengers:**
- Show: Cab OR "2 Autos recommended"
- Remove: All other options

---

## 🌍 METRO LOGIC

**If nearest metro station > 1km:**
- Remove metro option entirely
- Too far to walk

**Use zone features:**
```python
if zone['nearest_metro_distance_km'] > 1.0:
    options.remove('metro')
```

---

## 🌧️ WEATHER RULES

**If raining:**
- Cancellation risk += 30% (hardcoded rule)
- Surge multiplier += 0.5x
- Display weather alert: "⚠️ Rain detected - higher cancellation risk"

**API Call:**
```python
response = requests.get(
    "https://api.open-meteo.com/v1/forecast",
    params={
        "latitude": 17.385,
        "longitude": 78.486,
        "current_weather": true
    }
)
is_raining = response['current_weather']['precipitation'] > 0
```

---

## 📁 KEY FILES LOCATION

**Data:**
- `cleaned_data/Bengaluru_Ola_clean.csv` — Training data
- `cleaned_data/hyderabad_zones_features.csv` — Zone features
- `cleaned_data/yaary_reviews_with_sentiment.csv` — Pain points for presentation

**Documentation:**
- `CITYNEXUS_PROJECT_ARCHITECTURE.md` — Full architecture guide
- `HYDERABAD_DATA_SUMMARY.md` — Data cleaning summary
- `QUICK_START_CHECKLIST.md` — This file

**Scripts (if you need to re-run):**
- `clean_data.py` — Data cleaning
- `engineer_zone_features.py` — Zone feature engineering
- `analyze_yaary_reviews.py` — Sentiment analysis

---

## 🎯 MINIMUM VIABLE DEMO (Week 6)

**Must Have:**
- [ ] User enters origin/destination
- [ ] System shows 4 transport options
- [ ] Each option shows: time, cost, cancellation risk
- [ ] Map displays route
- [ ] Weather alert if raining
- [ ] Recommended option highlighted
- [ ] Works on desktop & mobile
- [ ] Live URL (deployed)

**If this works, you pass. Everything else is bonus.**

---

## 💡 PRO TIPS

1. **Start with Week 1 immediately** — Model training takes time
2. **Use Google Colab for ML** — Free GPU, saves local setup
3. **Test APIs early** — Don't wait till Week 4 to discover API limits
4. **Keep frontend simple** — Focus on functionality over fancy design
5. **Deploy early (Week 5)** — Find deployment issues before Week 7
6. **Practice demo 10+ times** — Know your talking points cold
7. **Be honest about limitations** — Judges appreciate transparency

---

## 🆘 IF YOU GET STUCK

**ML Model not converging?**
- Check class balance (use `scale_pos_weight`)
- Try simpler features first (just hour + day_of_week)
- Use RandomForest as baseline

**Google Maps API expensive?**
- Free tier: 28,000 requests/month
- Cache responses (TTL = 5 minutes)
- Use fewer API calls during testing

**Frontend-backend connection failing?**
- Check CORS settings in FastAPI
- Verify backend URL in frontend .env
- Test endpoints with Postman first

**Database not loading?**
- Check CSV encoding (UTF-8)
- Verify column names match schema
- Use pgAdmin to inspect tables

---

## 📞 FINAL REMINDER

**By Week 6, you should have:**
1. Working demo with TIER 1 features
2. Trained ML model with >0.70 F1-score
3. Clean codebase on GitHub
4. Deployed live URL
5. Presentation slides ready

**By Week 8, you should have:**
- Polished demo
- Rehearsed presentation
- Submitted project

---

**You have everything you need. Now execute. Good luck! 🚀**
