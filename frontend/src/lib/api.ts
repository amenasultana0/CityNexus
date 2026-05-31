import axios from "axios"

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000"
const api = axios.create({ baseURL: BASE })

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FactorItem {
  factor: string
  impact: "positive" | "negative" | "neutral"
  detail: string
}

export interface PredictRequest {
  origin_lat: number
  origin_lon: number
  dest_lat: number
  dest_lon: number
  passengers?: number
  hour: number
  day_of_week: number
  month: number
  override_rain?: boolean
}

// ─── New simplified interfaces (task spec) ────────────────────────────────────

export interface WeatherResponse {
  is_raining: boolean
  weather_condition: string
  weathercode: number
  risk_multiplier: number
}

export interface TransportAlternative {
  mode: string
  cost: number
  time_minutes: number
  risk_level: string
  recommended: boolean
  description: string
}

export interface BestTimeSlot {
  hour: number
  cancel_probability: number
  risk_level: string
  recommended: boolean
}

export interface RouteReliability {
  score: number
  cancellation_rate: number
  avg_wait: number
  driver_supply: number
}

export interface OptimalPickup {
  name: string
  zone_type: string
  distance_km: number
  latitude: number
  longitude: number
}

export interface WeeklyPlanDay {
  day_name: string
  recommended_mode: string
  cost: number
  risk_level: string
  reason: string
}

export interface GeocodedLocation {
  lat: number
  lon: number
  display_name: string
}

export interface PredictResponse {
  risk_level: string
  probability: number
  is_raining: boolean
  weather_conditions: string
  cancel_rate: number
  demand_score: number
  driver_supply: number
  factors: FactorItem[]
  using_ml_model: boolean
}

export interface RouteReliabilityResponse {
  score: number
  label: string
  cancel_rate: number
  avg_wait_min: number
  surge_frequency: string
  recommended_modes: string[]
}

export interface TimeSlot {
  hour: number
  time_label: string
  color: "green" | "yellow" | "red"
  cancel_risk: number
  surge: number
  risk_level: string
}

export interface BestTimeResponse {
  slots: TimeSlot[]
  best_slot: TimeSlot | null
}

export interface TransportOption {
  mode: string
  variant: string | null
  time_min: number
  cost_inr: number
  // ADD these three lines after cost_inr: number
  cost_min_inr: number
  cost_max_inr: number
  cost_display: string
  surge_multiplier: number
  risk_level: string
  reliability_score: number
  available: boolean
  reason: string
  vehicles_needed: number
}

export interface AlternativesResponse {
  distance_km: number
  options: TransportOption[]
}

export interface PickupSuggestion {
  name: string
  stop_type: string
  distance_m: number
  walk_min: number
  risk_reduction_pct: number
  lat: number
  lon: number
}

export interface OptimalPickupResponse {
  suggestions: PickupSuggestion[]
}

export interface CostEntry {
  mode: string
  variant: string | null
  base_cost_inr: number
  surge_multiplier: number
  final_cost_inr: number
  // ADD these three lines after final_cost_inr: number
  cost_min_inr: number
  cost_max_inr: number
  cost_display: string
  time_min: number
  available: boolean
}

export interface JourneyCostResponse {
  distance_km: number
  is_raining: boolean
  costs: CostEntry[]
}

export interface WeatherImpactResponse {
  is_raining: boolean
  temperature_c: number
  windspeed_kmh: number
  weather_code: number
  conditions: string
  risk_impact: string
  cancel_rate_multiplier: number
  surge_multiplier_cab: number
  surge_multiplier_auto: number
  surge_multiplier_bike: number
  cached: boolean
}

export interface DayPlan {
  is_festival: boolean
  festival_name: string | null
  weather_desc: string
  weather_code: number
  is_raining: boolean
  cab_cost_inr: number
  savings_vs_cab: number
  date: string
  day_name: string
  recommended_mode: string
  variant: string | null
  cost_inr: number
  // ADD these three lines after cost_inr: number
  cost_min_inr: number
  cost_max_inr: number
  cost_display: string
  surge_multiplier: number
  time_min: number
  risk_level: string
  reason: string
}

export interface WeeklyPlanResponse {
  weekly_plan: DayPlan[]
  cheapest_mode: string
  total_estimated_cost_inr: number
  total_cab_cost_inr: number
  total_savings_inr: number
}

export interface WeeklyPlanRequest {
  origin_lat: number
  origin_lon: number
  dest_lat: number
  dest_lon: number
  passengers: number
  departure_time: string
  round_trip?: boolean
}

// ─── API Functions ────────────────────────────────────────────────────────────

export const predictCancellation = async (
  payload: PredictRequest,
): Promise<PredictResponse> => {
  const { data } = await api.post("/api/v1/rides/predict-cancellation", payload)
  return data
}

export const getRouteReliability = async (params: {
  origin_lat: number
  origin_lon: number
  dest_lat: number
  dest_lon: number
  hour: number
  day_of_week: number
}): Promise<RouteReliabilityResponse> => {
  const { data } = await api.get("/api/v1/rides/route-reliability", { params })
  return data
}

export const getBestTime = async (params: {
  origin_lat: number
  origin_lon: number
  dest_lat: number
  dest_lon: number
  current_hour: number
  day_of_week: number
  lookahead_hours?: number
}): Promise<BestTimeResponse> => {
  const { data } = await api.get("/api/v1/rides/best-time-to-leave", { params })
  return data
}

export const getAlternatives = async (params: {
  origin_lat: number
  origin_lon: number
  dest_lat: number
  dest_lon: number
  passengers?: number
  hour: number
  day_of_week: number
  is_raining?: boolean
}): Promise<AlternativesResponse> => {
  const { data } = await api.get("/api/v1/transport/alternatives", { params })
  return data
}

export const getJourneyCost = async (payload: {
  origin_lat: number
  origin_lon: number
  dest_lat: number
  dest_lon: number
  passengers: number
  datetime?: string
}): Promise<JourneyCostResponse> => {
  const { data } = await api.post("/api/v1/transport/journey-cost", payload)
  return data
}

export const getOptimalPickup = async (payload: {
  origin_lat: number
  origin_lon: number
  radius_m?: number
}): Promise<OptimalPickupResponse> => {
  const { data } = await api.post("/api/v1/transport/optimal-pickup", payload)
  return data
}

export const getWeatherImpact = async (lat?: number, lon?: number): Promise<WeatherImpactResponse> => {
  const params = lat !== undefined && lon !== undefined ? { lat, lon } : {}
  const { data } = await api.get("/api/v1/weather/impact", { params })
  return data
}

export const getWeeklyPlan = async (
  payload: WeeklyPlanRequest,
): Promise<WeeklyPlanResponse> => {
  const { data } = await api.post("/api/v1/commute/weekly-plan", payload)
  return data
}

// ─── Geocoding (Nominatim) ────────────────────────────────────────────────────

export const geocodeLocation = async (query: string): Promise<GeocodedLocation | null> => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', Hyderabad')}&format=json&limit=1`,
      { headers: { "User-Agent": "CityNexus/1.0" } },
    )
    const data = await response.json()
    if (!data || data.length === 0) return null
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      display_name: data[0].display_name,
    }
  } catch {
    return null
  }
}

export const geocode = async (
  locationName: string,
): Promise<{ lat: number; lon: number }> => {
  try {
    const response = await api.get("/api/v1/utils/geocode/", {
      params: { location: locationName },
    })
    return { lat: response.data.lat, lon: response.data.lon }
  } catch (error) {
    throw new Error(`Could not find location: ${locationName}`)
  }
}
// -------------------------
// Heatmap shared route state
// -------------------------

export interface SavedRoute {
  pickup: string
  destination: string
}

const ROUTE_STORAGE_KEY = "citynexus_route"

export function saveRoute(
  pickup: string,
  destination: string,
) {
  localStorage.setItem(
    ROUTE_STORAGE_KEY,
    JSON.stringify({
      pickup,
      destination,
    }),
  )
}

export function getSavedRoute():
  | SavedRoute
  | null {
  const raw =
    localStorage.getItem(
      ROUTE_STORAGE_KEY,
    )

  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
// -------------------------
// Google place geocode
// -------------------------

export async function geocodeGoogle(
  address: string,
) {
  const key =
    import.meta.env
      .VITE_GOOGLE_MAPS_KEY

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address,
    )}&key=${key}`

  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(
      "Failed to geocode",
    )
  }

  const data = await res.json()

  if (
    !data.results ||
    !data.results.length
  ) {
    throw new Error(
      "Location not found",
    )
  }

  const result =
    data.results[0]

  return {
    lat:
      result.geometry.location
        .lat,
    lon:
      result.geometry.location
        .lng,
    fullAddress:
      result.formatted_address,
  }
}
export async function getNearbyTransitStops(
  lat: number,
  lon: number,
) {
  const response =
    await getOptimalPickup({
      origin_lat: lat,
      origin_lon: lon,
      radius_m: 2500,
    })

  return response.suggestions.filter(
    (stop) =>
      stop.stop_type ===
        "metro" ||
      stop.stop_type ===
        "bus" ||
      stop.stop_type ===
        "mmts",
  )
}
export interface PlanTripRequest {
  origin_lat: number
  origin_lon: number
  dest_lat: number
  dest_lon: number
  arrive_by_hour: number
  arrive_by_minute: number
  day_offset: number
}
 
export interface SlotRecommendation {
  label: "balanced" | "cheapest" | "fastest"
  leave_hour: number
  leave_minute: number
  leave_time_label: string
  arrive_time_label: string
  buffer_min: number
  fare_inr: number
  fare_display: string
  duration_min: number
  mode: string
  surge_multiplier: number
  availability: string
  reasons: string[]
}
 
export interface ForecastAlert {
  type: "traffic" | "rain" | "surge" | "availability"
  text: string
}
 
export interface ConfidenceLevel {
  label: "High confidence" | "Moderate confidence" | "Conditions may change"
  detail: string
}
 
export interface PlanTripResponse {
  best: SlotRecommendation
  alternatives: SlotRecommendation[]
  alerts: ForecastAlert[]
  confidence: ConfidenceLevel
  metro_tip: string | null
}
 
export const planTrip = async (
  payload: PlanTripRequest,
): Promise<PlanTripResponse> => {
  const { data } = await api.post("/api/v1/rides/plan-trip", payload)
  return data
}
 