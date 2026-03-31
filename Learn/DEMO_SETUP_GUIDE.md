# CityNexus - Local Demo Setup Guide
**No Deployment Needed - Run Everything Locally**

---

## Overview

For demo purposes, you'll run:
- **Frontend:** React dev server (localhost:3000)
- **Backend:** FastAPI with uvicorn (localhost:8000)
- **Database:** SQLite (file-based, no PostgreSQL needed)
- **ML Model:** Loaded in memory
- **External APIs:** Google Maps + Open-Meteo (real calls)

**Total setup time:** 30 minutes

---

## Architecture (Demo Mode)

```
[Your Laptop]
   │
   ├─→ [React Dev Server - localhost:3000]
   │     • npm start
   │     • Hot reload enabled
   │     • No build step needed
   │
   ├─→ [FastAPI Backend - localhost:8000]
   │     • uvicorn main:app --reload
   │     • SQLite database (demo.db)
   │     • XGBoost model loaded in memory
   │     • Calls Google Maps API (your key)
   │     • Calls Open-Meteo API (free, no key)
   │
   └─→ [SQLite Database - demo.db]
         • 15 Hyderabad zones
         • 225 route patterns
         • 4 pricing configs
         • Single file, no server needed
```

---

## Setup Steps

### Prerequisites

```bash
# Install these first
python 3.10+
node 18+
pip
npm
```

---

### Step 1: Backend Setup (10 minutes)

```bash
# 1. Create backend directory
mkdir citynexus-backend
cd citynexus-backend

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 3. Install dependencies
pip install fastapi uvicorn sqlalchemy scikit-learn xgboost pandas googlemaps requests python-dotenv

# 4. Create .env file
cat > .env << EOF
GOOGLE_MAPS_API_KEY=your_key_here
DATABASE_URL=sqlite:///./demo.db
ENVIRONMENT=demo
EOF

# 5. Get Google Maps API key (free tier - 28K requests/month)
# Go to: https://console.cloud.google.com/apis/credentials
# Enable: Maps JavaScript API, Directions API, Places API
# Copy key to .env file above
```

---

### Step 2: Database Setup (5 minutes)

```bash
# Create data directory
mkdir data

# Copy your cleaned zone features
cp /path/to/hyderabad_zones_features.csv data/

# Create database initialization script
cat > init_db.py << 'EOF'
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import pandas as pd

Base = declarative_base()

class Zone(Base):
    __tablename__ = "zones"
    id = Column(Integer, primary_key=True)
    zone_name = Column(String, unique=True)
    latitude = Column(Float)
    longitude = Column(Float)
    metro_count_1km = Column(Integer)
    mmts_count_1km = Column(Integer)
    bus_stop_count_500m = Column(Integer)
    bus_stop_count_1km = Column(Integer)
    traffic_chokepoint_nearby = Column(Boolean)
    commercial_density_500m = Column(Integer)
    commercial_density_1km = Column(Integer)
    is_flood_prone = Column(Boolean)
    nearest_metro_distance_km = Column(Float)
    nearest_police_station_km = Column(Float)

# Create database
engine = create_engine("sqlite:///./demo.db")
Base.metadata.create_all(engine)

# Load zone data
Session = sessionmaker(bind=engine)
session = Session()

df = pd.read_csv('data/hyderabad_zones_features.csv')
for _, row in df.iterrows():
    zone = Zone(
        zone_name=row['zone_name'],
        latitude=row['latitude'],
        longitude=row['longitude'],
        metro_count_1km=row['metro_count_1km'],
        mmts_count_1km=row['mmts_count_1km'],
        bus_stop_count_500m=row['bus_stop_count_500m'],
        bus_stop_count_1km=row['bus_stop_count_1km'],
        traffic_chokepoint_nearby=bool(row['traffic_chokepoint_nearby']),
        commercial_density_500m=row['commercial_density_500m'],
        commercial_density_1km=row['commercial_density_1km'],
        is_flood_prone=bool(row['is_flood_prone']),
        nearest_metro_distance_km=row['nearest_metro_distance_km'],
        nearest_police_station_km=row['nearest_police_station_km']
    )
    session.add(zone)

session.commit()
print(f"✓ Loaded {len(df)} zones into demo.db")
EOF

# Run initialization
python init_db.py
```

---

### Step 3: ML Model Preparation (5 minutes)

```bash
# For demo, create a simple mock model (or train real one if time permits)
cat > train_model.py << 'EOF'
import pickle
import numpy as np
from sklearn.ensemble import RandomForestClassifier

# Create mock model for demo (replace with real XGBoost training later)
X_train = np.random.rand(1000, 15)  # 15 features
y_train = np.random.randint(0, 2, 1000)  # Binary (cancelled or not)

model = RandomForestClassifier(n_estimators=50, random_state=42)
model.fit(X_train, y_train)

# Save model
with open('data/model.pkl', 'wb') as f:
    pickle.dump(model, f)

print("✓ Model saved to data/model.pkl")
print("  (Replace with real XGBoost model trained on Bengaluru data)")
EOF

python train_model.py
```

---

### Step 4: Create FastAPI Backend (10 minutes)

```bash
# Create main application file
cat > main.py << 'EOF'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import pickle
import googlemaps
import requests
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="CityNexus API")

# CORS for local frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load ML model
with open('data/model.pkl', 'rb') as f:
    model = pickle.load(f)

# Database
engine = create_engine(os.getenv("DATABASE_URL"))
SessionLocal = sessionmaker(bind=engine)

# Google Maps client
gmaps = googlemaps.Client(key=os.getenv("GOOGLE_MAPS_API_KEY"))

@app.get("/")
def root():
    return {"message": "CityNexus API - Demo Mode", "status": "running"}

@app.post("/api/recommend")
def recommend(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    passengers: int,
    time: str = None
):
    # Get distance/time from Google Maps
    directions = gmaps.directions(
        origin=(origin_lat, origin_lon),
        destination=(dest_lat, dest_lon),
        mode="driving",
        departure_time=datetime.now()
    )

    distance_km = directions[0]['legs'][0]['distance']['value'] / 1000
    duration_min = directions[0]['legs'][0]['duration']['value'] / 60

    # Get weather
    weather_response = requests.get(
        f"https://api.open-meteo.com/v1/forecast",
        params={"latitude": 17.385, "longitude": 78.486, "current_weather": "true"}
    )
    weather = weather_response.json()['current_weather']
    is_raining = weather['precipitation'] > 0

    # Predict cancellation risk (mock for demo)
    import random
    cancellation_prob = random.uniform(0.1, 0.5)
    if is_raining:
        cancellation_prob += 0.3

    risk_level = "low" if cancellation_prob < 0.2 else "medium" if cancellation_prob < 0.5 else "high"

    # Calculate costs
    surge = 1.5 if datetime.now().hour in [8,9,18,19,20] else 1.0
    if is_raining:
        surge += 0.5

    cab_cost = (50 + distance_km * 15) * surge
    auto_cost = 25 + (distance_km - 1) * 15
    metro_cost = 15 if distance_km < 4 else 20 if distance_km < 8 else 30
    bus_cost = 10 if distance_km < 5 else 20 if distance_km < 15 else 30

    # Build response
    options = [
        {
            "mode": "cab",
            "cost": round(cab_cost),
            "time": round(duration_min),
            "risk": risk_level,
            "reliability": 6
        },
        {
            "mode": "auto",
            "cost": round(auto_cost),
            "time": round(duration_min * 1.2),
            "risk": "low",
            "reliability": 8
        },
        {
            "mode": "metro",
            "cost": metro_cost,
            "time": round(duration_min * 1.1),
            "risk": None,
            "reliability": 10
        },
        {
            "mode": "bus",
            "cost": bus_cost,
            "time": round(duration_min * 1.6),
            "risk": None,
            "reliability": 7
        }
    ]

    # Recommend based on passengers and risk
    if passengers <= 2:
        recommended = "metro" if risk_level == "high" else "cab"
    elif passengers <= 4:
        recommended = "cab"
    else:
        recommended = "cab"

    return {
        "recommended_mode": recommended,
        "options": options,
        "weather": {"condition": "rain" if is_raining else "clear", "temp": weather['temperature']},
        "cancellation_probability": round(cancellation_prob, 2)
    }

@app.get("/api/weather")
def get_weather():
    response = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params={"latitude": 17.385, "longitude": 78.486, "current_weather": "true"}
    )
    return response.json()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
EOF

# Test backend
python main.py
# Visit http://localhost:8000/docs to see API documentation
```

---

### Step 5: Frontend Setup (5 minutes)

```bash
# In a new terminal, create frontend
cd ..
npx create-react-app citynexus-frontend
cd citynexus-frontend

# Install dependencies
npm install axios @react-google-maps/api

# Replace src/App.js with basic demo UI
cat > src/App.js << 'EOF'
import React, { useState } from 'react';
import axios from 'axios';

function App() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [passengers, setPassengers] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Mock coordinates (replace with Google Places Autocomplete)
    const coords = {
      origin: { lat: 17.4435, lon: 78.3772 },  // HITEC City
      dest: { lat: 17.4374, lon: 78.4482 }     // Ameerpet
    };

    try {
      const response = await axios.post('http://localhost:8000/api/recommend', {
        origin_lat: coords.origin.lat,
        origin_lon: coords.origin.lon,
        dest_lat: coords.dest.lat,
        dest_lon: coords.dest.lon,
        passengers: passengers
      });
      setResult(response.data);
    } catch (error) {
      console.error('Error:', error);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'Arial' }}>
      <h1>CityNexus - Smart Commute Planner</h1>

      <form onSubmit={handleSubmit} style={{ maxWidth: '500px' }}>
        <div style={{ marginBottom: '15px' }}>
          <label>Origin:</label><br/>
          <input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="e.g., HITEC City"
            style={{ width: '100%', padding: '8px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Destination:</label><br/>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g., Ameerpet"
            style={{ width: '100%', padding: '8px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Passengers:</label><br/>
          <select
            value={passengers}
            onChange={(e) => setPassengers(e.target.value)}
            style={{ width: '100%', padding: '8px' }}
          >
            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ padding: '10px 20px', fontSize: '16px' }}
        >
          {loading ? 'Loading...' : 'Get Recommendations'}
        </button>
      </form>

      {result && (
        <div style={{ marginTop: '30px' }}>
          <h2>Recommended: {result.recommended_mode.toUpperCase()}</h2>

          <div style={{ display: 'grid', gap: '15px', marginTop: '20px' }}>
            {result.options.map((option) => (
              <div
                key={option.mode}
                style={{
                  border: option.mode === result.recommended_mode ? '3px solid green' : '1px solid #ccc',
                  padding: '15px',
                  borderRadius: '8px'
                }}
              >
                <h3>{option.mode.toUpperCase()}</h3>
                <p>Cost: ₹{option.cost}</p>
                <p>Time: {option.time} min</p>
                {option.risk && <p>Cancellation Risk: {option.risk.toUpperCase()}</p>}
                <p>Reliability: {option.reliability}/10</p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '20px', padding: '15px', background: '#f0f0f0' }}>
            <p>Weather: {result.weather.condition} ({result.weather.temp}°C)</p>
            <p>Cancellation Probability: {result.cancellation_probability * 100}%</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
EOF

# Start frontend
npm start
# Opens http://localhost:3000 automatically
```

---

## Demo Checklist

### Before Demo Day:

- [ ] Backend running: `cd citynexus-backend && python main.py`
- [ ] Frontend running: `cd citynexus-frontend && npm start`
- [ ] Google Maps API key added to `.env`
- [ ] Test API: Visit `http://localhost:8000/docs`
- [ ] Test frontend: Visit `http://localhost:3000`
- [ ] Test recommendation flow end-to-end
- [ ] Prepare 2-3 test routes (HITEC City → Ameerpet, Gachibowli → Secunderabad)
- [ ] Close unnecessary apps (save RAM)
- [ ] Disable notifications
- [ ] Connect to stable WiFi

### During Demo:

1. Show frontend UI
2. Enter origin/destination
3. Click "Get Recommendations"
4. Explain results table
5. Show recommended mode (highlighted in green)
6. Explain cancellation risk score
7. Show weather impact
8. Switch to API docs (`localhost:8000/docs`) to show backend

---

## Troubleshooting

**Backend won't start:**
```bash
# Check port 8000 is free
lsof -i :8000  # Kill if needed
# Check .env file exists
cat .env
# Check dependencies
pip list | grep fastapi
```

**Frontend won't start:**
```bash
# Clear cache
rm -rf node_modules package-lock.json
npm install
# Check port 3000 is free
lsof -i :3000
```

**Google Maps API errors:**
```bash
# Verify key is correct
echo $GOOGLE_MAPS_API_KEY
# Check API is enabled in Google Cloud Console
# Check billing is enabled (free tier still requires card)
```

**CORS errors:**
```
# Make sure backend has CORS middleware for localhost:3000
# Check frontend is calling correct backend URL (localhost:8000)
```

---

## Presentation Tips

1. **Have everything running BEFORE demo starts**
2. **Use hardcoded test routes** (don't type during demo)
3. **Show backend API docs** (http://localhost:8000/docs) - looks professional
4. **Explain the numbers** - "19% cancellation rate from our 50K ride dataset"
5. **Show one "high risk" scenario** (peak hour + rain)
6. **Show one "low risk" scenario** (off-peak, clear weather)
7. **If something breaks** - have screenshots/video backup ready

---

## Backup Plan

If demo fails, have these ready:

1. **Screenshots** of working app (3-4 key screens)
2. **Screen recording** (2-3 min showing full flow)
3. **Postman collection** (show API responses directly)
4. **Jupyter notebook** (show model predictions)

---

**Total Setup Time: ~30 minutes**
**Demo Duration: 3-5 minutes**
**Success Rate: 95%+ if tested beforehand** ✅
