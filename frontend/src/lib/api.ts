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
  hour: number
  day_of_week: number
  month: number
  override_rain?: boolean
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
  date: string
  day_name: string
  recommended_mode: string
  variant: string | null
  cost_inr: number
  surge_multiplier: number
  time_min: number
  risk_level: string
  reason: string
}

export interface WeeklyPlanResponse {
  weekly_plan: DayPlan[]
  cheapest_mode: string
  total_estimated_cost_inr: number
}

export interface WeeklyPlanRequest {
  origin_lat: number
  origin_lon: number
  dest_lat: number
  dest_lon: number
  passengers: number
  departure_time: string
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

export const getWeatherImpact = async (): Promise<WeatherImpactResponse> => {
  const { data } = await api.get("/api/v1/weather/impact")
  return data
}

export const getWeeklyPlan = async (
  payload: WeeklyPlanRequest,
): Promise<WeeklyPlanResponse> => {
  const { data } = await api.post("/api/v1/commute/weekly-plan", payload)
  return data
}

// ─── Geocoding (Nominatim) ────────────────────────────────────────────────────

export const geocode = async (
  locationName: string,
): Promise<{ lat: number; lon: number }> => {
  const response = await axios.get(
    "https://nominatim.openstreetmap.org/search",
    {
      params: {
        q: `${locationName},Hyderabad`,
        format: "json",
        limit: 1,
      },
      headers: { "User-Agent": "CityNexus/1.0" },
    },
  )
  if (!response.data || response.data.length === 0) {
    throw new Error(`Could not find location: ${locationName}`)
  }
  const result = response.data[0]
  return { lat: parseFloat(result.lat), lon: parseFloat(result.lon) }
}
