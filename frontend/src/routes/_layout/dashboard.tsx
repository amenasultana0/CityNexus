import { useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import TripPlannerModal from "@/components/Common/TripPlannerModal"
import { buildUberUrl, buildOlaUrl } from "@/utils/uberDeepLink"
import {
  Box,
  Container,
  Flex,
  Grid,
  Heading,
  Input,
  Text,
  VStack,
  Dialog,
  Portal,
  Button,
} from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import { ArrowLeftRight, MapPin } from "lucide-react"
import { Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Button as UIButton } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  type PredictRequest,
  getAlternatives,
  getBestTime,
  getJourneyCost,
  getOptimalPickup,
  getRouteReliability,
  getWeatherImpact,
  predictCancellation,
  saveRoute,
} from "@/lib/api"
import { Autocomplete, useJsApiLoader } from "@react-google-maps/api"

async function getBusStopSchedule(stopName: string, hour?: number) {
  const params = new URLSearchParams({ stop_name: stopName })
  if (hour !== undefined) params.append("hour", String(hour))
  const res = await fetch(`/api/v1/transport/bus-stop-schedule?${params}`)
  if (!res.ok) throw new Error("Failed to fetch schedule")
  return res.json()
}

const LIBRARIES: ("places")[] = ["places"]

function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Box bg="#f8f9fa" border={`1px solid ${BORDER}`} borderRadius="10px" p={4} textAlign="center">
      <Text color={MUTED} fontSize="sm" mb={onRetry ? 2 : 0}>{message}</Text>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} style={{ borderColor: BORDER, color: MUTED, marginTop: "4px" }}>
          Retry
        </Button>
      )}
    </Box>
  )
}

export const Route = createFileRoute("/_layout/dashboard")({
  component: Dashboard,
})

interface FormData {
  originLat: number
  originLon: number
  destLat: number
  destLon: number
  passengers: number
  hour: number
  dayOfWeek: number
  month: number
}

interface BusRoute {
  route_name: string
  next_arrival: string
  destination?: string
  is_best?: boolean
}

interface ScheduleData {
  routes?: BusRoute[]
  error?: string
}

const MODE_EMOJI: Record<string, string> = {
  metro: "🚇", bus: "🚌", auto: "🛺", cab: "🚗",
  "cab-mini": "🚗", "cab-sedan": "🚗", "cab-suv": "🚙", bike: "🛵",
}
const MODE_COLOR: Record<string, string> = {
  metro: "#0694a2", auto: "#f97316", bus: "#92400e", bike: "#7c3aed",
  cab: "#6b7280", "cab-mini": "#6b7280", "cab-sedan": "#6b7280", "cab-suv": "#6b7280",
}

function modeEmoji(mode: string, variant?: string | null): string {
  if (variant) return MODE_EMOJI[`${mode}-${variant}`] ?? MODE_EMOJI[mode] ?? "🚌"
  return MODE_EMOJI[mode] ?? "🚌"
}
function modeColor(mode: string): string {
  return MODE_COLOR[mode] ?? "#6b7280"
}

const PAGE_BG = "#f0f4f8"
const CARD = "#ffffff"
const CARD_SHADOW = "0 4px 16px rgba(0,0,0,0.08)"
const BORDER = "#e2e8f0"
const PRIMARY = "#1a202c"
const MUTED = "#718096"
const SUBTLE = "#a0aec0"
const INPUT_BG = "#f7fafc"
const BLUE = "#1a56db"
const TEAL = "#0694a2"
const GREEN = "#10b981"
const AMBER = "#f59e0b"
const RED = "#ef4444"
const COST_COLORS = [TEAL, BLUE, AMBER, RED, "#9f7aea", "#38b2ac"]

function getRiskBorderColor(level: string) {
  return level === "low" ? GREEN : level === "moderate" ? AMBER : RED
}
function getRiskTextColor(level: string) {
  return level === "low" ? GREEN : level === "moderate" ? AMBER : RED
}

function Card({ children, topColor, p = 6 }: { children: React.ReactNode; topColor?: string; p?: number }) {
  return (
    <Box bg={CARD} borderRadius="16px" p={p} boxShadow={CARD_SHADOW} borderTop={topColor ? `4px solid ${topColor}` : undefined}>
      {children}
    </Box>
  )
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={3}>
      {children}
    </Text>
  )
}

function Dashboard() {
  const [selectedStop, setSelectedStop] = useState<any>(null)
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null)
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false)
  const [passengers, setPassengers] = useState(1)
  const [timeStr, setTimeStr] = useState("08:00")
  const [formData, setFormData] = useState<FormData | null>(null)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [geoError, setGeoError] = useState("")
  const [pickupText, setPickupText] = useState("")
  const [sortMode, setSortMode] = useState<"best" | "cheapest" | "fastest">("best")
  const [destText, setDestText] = useState("")
  const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [destLocation, setDestLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [plannerOpen, setPlannerOpen] = useState(false)
  const pickupRef = useRef<google.maps.places.Autocomplete | null>(null)
  const destRef = useRef<google.maps.places.Autocomplete | null>(null)
  const alternativesRef = useRef<HTMLDivElement | null>(null)

  const scrollToAlternatives = () => {
    alternativesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  })

  const handleSubmit = async () => {
    if (!pickupText || !destText) return
    setIsGeocoding(true)
    setGeoError("")
    try {
      if (!pickupLocation || !destLocation) {
        setGeoError("Please select locations from dropdown")
        return
      }
      const pickup = { lat: pickupLocation.lat, lon: pickupLocation.lng }
      const dest = { lat: destLocation.lat, lon: destLocation.lng }
      const h = parseInt(timeStr.split(":")[0], 10)
      const now = new Date()
      const jsDay = now.getDay()
      const dow = jsDay === 0 ? 6 : jsDay - 1
      localStorage.setItem("tripData", JSON.stringify({
        pickupText, destText,
        pickupLat: pickup.lat, pickupLng: pickup.lon,
        destLat: dest.lat, destLng: dest.lon,
      }))
      saveRoute(pickupText, destText)
      setFormData({
        originLat: pickup.lat, originLon: pickup.lon,
        destLat: dest.lat, destLon: dest.lon,
        passengers, hour: h, dayOfWeek: dow, month: now.getMonth() + 1,
      })
    } catch (e: unknown) {
      setGeoError(e instanceof Error ? e.message : "Could not geocode locations")
    } finally {
      setIsGeocoding(false)
    }
  }

  const onPickupPlaceChanged = () => {
    const place = pickupRef.current?.getPlace()
    if (!place?.geometry?.location) return
    setPickupText(place.formatted_address || "")
    setPickupLocation({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() })
  }

  const onDestPlaceChanged = () => {
    const place = destRef.current?.getPlace()
    if (!place?.geometry?.location) return
    setDestText(place.formatted_address || "")
    setDestLocation({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() })
  }

  const handleSwap = () => {
    setPickupText(destText)
    setDestText(pickupText)
    setPickupLocation(destLocation)
    setDestLocation(pickupLocation)
  }

  const weatherQuery = useQuery({
    queryKey: ["weather", formData?.originLat, formData?.originLon],
    queryFn: () => getWeatherImpact(formData!.originLat, formData!.originLon),
    staleTime: 15 * 60 * 1000,
    enabled: !!formData,
  })

  const predictionQuery = useQuery({
    queryKey: ["prediction", formData],
    queryFn: () => {
      const fd = formData!
      const payload: PredictRequest = {
        origin_lat: fd.originLat, origin_lon: fd.originLon,
        dest_lat: fd.destLat, dest_lon: fd.destLon,
        passengers: fd.passengers, hour: fd.hour,
        day_of_week: fd.dayOfWeek, month: fd.month,
      }
      return predictCancellation(payload)
    },
    enabled: !!formData,
  })

  const reliabilityQuery = useQuery({
    queryKey: ["reliability", formData],
    queryFn: () => getRouteReliability({
      origin_lat: formData!.originLat, origin_lon: formData!.originLon,
      dest_lat: formData!.destLat, dest_lon: formData!.destLon,
      hour: formData!.hour, day_of_week: formData!.dayOfWeek,
    }),
    enabled: !!formData,
  })

  const bestTimeQuery = useQuery({
    queryKey: ["bestTime", formData],
    queryFn: () => getBestTime({
      origin_lat: formData!.originLat, origin_lon: formData!.originLon,
      dest_lat: formData!.destLat, dest_lon: formData!.destLon,
      current_hour: formData!.hour, day_of_week: formData!.dayOfWeek, lookahead_hours: 6,
    }),
    enabled: !!formData,
  })

  const alternativesQuery = useQuery({
    queryKey: ["alternatives", formData, weatherQuery.data?.is_raining],
    queryFn: () => getAlternatives({
      origin_lat: formData!.originLat, origin_lon: formData!.originLon,
      dest_lat: formData!.destLat, dest_lon: formData!.destLon,
      passengers: formData!.passengers, hour: formData!.hour,
      day_of_week: formData!.dayOfWeek, is_raining: weatherQuery.data?.is_raining ?? false,
    }),
    enabled: !!formData,
  })

  const costQuery = useQuery({
    queryKey: ["cost", formData],
    queryFn: () => {
      const now = new Date()
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), formData!.hour, 0, 0).toISOString()
      return getJourneyCost({
        origin_lat: formData!.originLat, origin_lon: formData!.originLon,
        dest_lat: formData!.destLat, dest_lon: formData!.destLon,
        passengers: formData!.passengers, datetime: dt,
      })
    },
    enabled: !!formData,
  })

  const pickupQuery = useQuery({
    queryKey: ["pickup", formData],
    queryFn: () => getOptimalPickup({ origin_lat: formData!.originLat, origin_lon: formData!.originLon, radius_m: 1000 }),
    enabled: !!formData,
  })

  const bestOption = (() => {
    const available = alternativesQuery.data?.options.filter((o) => o.available)
    if (!available || available.length === 0) return undefined
    const riskOrder: Record<string, number> = { low: 0, moderate: 1, high: 2 }
    const maxCost = Math.max(...available.map((o) => o.cost_inr), 1)
    const maxTime = Math.max(...available.map((o) => o.time_min), 1)
    return [...available].sort((a, b) => {
      const score = (o: typeof a) => {
        const r = (riskOrder[o.risk_level] ?? 1) / 2
        const c = o.cost_inr / maxCost
        const t = o.time_min / maxTime
        return 0.35 * r + 0.35 * c + 0.30 * t
      }
      return score(a) - score(b)
    })[0]
  })()

  return (
    <Box bg={PAGE_BG} minH="100vh">
      <style>{`
        @keyframes gradientShift {
          0%   { background-position: 0%   50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0%   50%; }
        }
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes pulseDot {
          0%,100% { box-shadow: 0 0 0 0   rgba(16,185,129,0.55); }
          50%     { box-shadow: 0 0 0 7px rgba(16,185,129,0);    }
        }
        .hero-gradient-bar {
          height: 3px;
          background: linear-gradient(90deg,#0694a2,#1a56db,#7c3aed,#ec4899,#f59e0b,#10b981,#0694a2);
          background-size: 400% 100%;
          animation: gradientShift 6s ease infinite;
        }
        .hero-card { animation: slideUpFade 0.48s cubic-bezier(0.22,1,0.36,1) both; }
        .hero-card-wrap { transition: transform 0.38s ease, box-shadow 0.38s ease; }
        .hero-card-wrap:hover {
          transform: translateY(-4px);
          box-shadow: 0 28px 70px rgba(0,0,0,0.13), 0 0 0 1px rgba(139,92,246,0.18) inset !important;
        }
        .hero-mode-icon {
          transition: transform 0.38s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease;
          cursor: default;
        }
        .hero-mode-icon:hover { transform: scale(1.16) rotate(-6deg); }
        .hero-btn-uber {
          position: relative; overflow: hidden;
          transition: all 0.28s cubic-bezier(0.34,1.56,0.64,1);
        }
        .hero-btn-uber::before {
          content:''; position:absolute; top:0; left:-100%; width:100%; height:100%;
          background: linear-gradient(90deg,transparent,rgba(255,255,255,0.13),transparent);
          transition: left 0.55s ease;
        }
        .hero-btn-uber:hover::before { left:100%; }
        .hero-btn-uber:hover { transform: translateY(-3px) scale(1.025); box-shadow: 0 14px 40px rgba(0,0,0,0.45) !important; }
        .hero-btn-ola {
          position: relative; overflow: hidden;
          transition: all 0.28s cubic-bezier(0.34,1.56,0.64,1);
        }
        .hero-btn-ola::before {
          content:''; position:absolute; top:0; left:-100%; width:100%; height:100%;
          background: linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent);
          transition: left 0.55s ease;
        }
        .hero-btn-ola:hover::before { left:100%; }
        .hero-btn-ola:hover { transform: translateY(-3px) scale(1.025); box-shadow: 0 14px 40px rgba(22,163,74,0.6) !important; }
        .hero-compare-btn {
          transition: all 0.28s cubic-bezier(0.34,1.56,0.64,1);
          position: relative; overflow: hidden;
        }
        .hero-compare-btn::before {
          content:''; position:absolute; top:0; left:-100%; width:100%; height:100%;
          background: linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent);
          transition: left 0.5s ease;
        }
        .hero-compare-btn:hover::before { left:100%; }
        .hero-compare-btn:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 8px 28px rgba(124,58,237,0.38) !important; }
        .hero-stat-cell { transition: background 0.22s ease; cursor: default; }
        .hero-stat-cell:hover { background: rgba(255,255,255,0.7); }
        .pulse-dot { animation: pulseDot 2.5s ease-in-out infinite; }
        .hero-best-badge {
          background: linear-gradient(135deg,#dcfce7,#bbf7d0);
          color: #16a34a; font-size: 0.68rem; font-weight: 700;
          letter-spacing: 0.04em; text-transform: uppercase;
          padding: 4px 12px; border-radius: 999px; white-space: nowrap;
        }
        .alt-row { transition: background 0.18s ease, transform 0.18s ease; border-radius: 14px; }
        .alt-row:hover { background: rgba(255,255,255,0.82) !important; transform: translateX(4px); }
      `}</style>

      <Container maxW="full" p={6}>
        <VStack gap={5} align="stretch">

          {/* ── Header row ── */}
          <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
            <Box>
              <Heading size="xl" color={PRIMARY} mb={1} fontWeight="700">Intelligence Dashboard</Heading>
              <Text color={MUTED} fontSize="sm">Real-time intelligence · Hyderabad commutes</Text>
            </Box>
            <UIButton
              onClick={() => setPlannerOpen(true)}
              style={{
                background: `linear-gradient(135deg, ${BLUE} 0%, #7c3aed 100%)`,
                color: "#fff", fontWeight: "600", borderRadius: "14px",
                height: "46px", padding: "0 28px", fontSize: "14px",
                boxShadow: "0 4px 18px rgba(26,86,219,0.28)", letterSpacing: "0.01em",
              }}
            >
              ✦ Plan a Trip
            </UIButton>
          </Flex>

          {/* ── Route Input ── */}
          <Box
            bg={CARD} borderRadius="20px" p={4}
            boxShadow="0 2px 20px rgba(0,0,0,0.06)"
            style={{ border: "1px solid rgba(226,232,240,0.7)" }}
          >
            <Flex gap={3} align="center" flexWrap="wrap">
              {/* Combined from → to pill */}
              <Flex
                flex="1 1 420px" align="center" bg="white" borderRadius="14px"
                border={`1.5px solid ${BORDER}`} boxShadow="0 2px 12px rgba(26,86,219,0.06)"
                overflow="hidden" minH="50px"
              >
                <Flex align="center" gap={2} flex={1} px={3} py={2}>
                  <MapPin size={16} color={BLUE} style={{ flexShrink: 0 }} />
                  {isLoaded ? (
                    <Autocomplete
                      onLoad={(a) => (pickupRef.current = a)}
                      onPlaceChanged={onPickupPlaceChanged}
                      options={{
                        componentRestrictions: { country: "in" },
                        bounds: new google.maps.LatLngBounds({ lat: 17.2, lng: 78.2 }, { lat: 17.6, lng: 78.7 }),
                        strictBounds: false,
                      }}
                    >
                      <input
                        value={pickupText}
                        onChange={(e) => setPickupText(e.target.value)}
                        placeholder="From — e.g. Ameerpet"
                        style={{ border: "none", outline: "none", background: "transparent", fontSize: "14px", color: PRIMARY, width: "100%", fontFamily: "inherit" }}
                      />
                    </Autocomplete>
                  ) : (
                    <input placeholder="From — e.g. Ameerpet" style={{ border: "none", outline: "none", background: "transparent", fontSize: "14px", color: PRIMARY, width: "100%", fontFamily: "inherit" }} />
                  )}
                </Flex>
                <Box w="1px" h="28px" bg={BORDER} flexShrink={0} />
                <Box
                  as="button" onClick={handleSwap} mx={2} p={2} borderRadius="8px" flexShrink={0}
                  _hover={{ bg: INPUT_BG }} transition="all 0.2s" title="Swap locations"
                >
                  <ArrowLeftRight size={15} color={MUTED} />
                </Box>
                <Box w="1px" h="28px" bg={BORDER} flexShrink={0} />
                <Flex align="center" gap={2} flex={1} px={3} py={2}>
                  <MapPin size={16} color={GREEN} style={{ flexShrink: 0 }} />
                  {isLoaded ? (
                    <Autocomplete
                      onLoad={(a) => (destRef.current = a)}
                      onPlaceChanged={onDestPlaceChanged}
                      options={{
                        componentRestrictions: { country: "in" },
                        bounds: new google.maps.LatLngBounds({ lat: 17.2, lng: 78.2 }, { lat: 17.6, lng: 78.7 }),
                        strictBounds: false,
                      }}
                    >
                      <input
                        value={destText}
                        onChange={(e) => setDestText(e.target.value)}
                        placeholder="To — e.g. Gachibowli"
                        style={{ border: "none", outline: "none", background: "transparent", fontSize: "14px", color: PRIMARY, width: "100%", fontFamily: "inherit" }}
                      />
                    </Autocomplete>
                  ) : (
                    <input placeholder="To — e.g. Gachibowli" style={{ border: "none", outline: "none", background: "transparent", fontSize: "14px", color: PRIMARY, width: "100%", fontFamily: "inherit" }} />
                  )}
                </Flex>
              </Flex>

              {/* Passengers +/- */}
              <Flex align="center" bg={INPUT_BG} borderRadius="12px" border={`1.5px solid ${BORDER}`} overflow="hidden" h="50px" flexShrink={0}>
                <Box as="button" px={3} h="100%" color={MUTED} fontSize="18px" _hover={{ bg: BORDER }} transition="background 0.15s" onClick={() => setPassengers(Math.max(1, passengers - 1))}>−</Box>
                <Text px={2} fontWeight="700" fontSize="sm" color={PRIMARY} minW="26px" textAlign="center">{passengers}</Text>
                <Box as="button" px={3} h="100%" color={MUTED} fontSize="18px" _hover={{ bg: BORDER }} transition="background 0.15s" onClick={() => setPassengers(Math.min(12, passengers + 1))}>+</Box>
              </Flex>

              {/* Time */}
              <Flex align="center" bg={INPUT_BG} borderRadius="12px" border={`1.5px solid ${BORDER}`} h="50px" px={3} flexShrink={0}>
                <Input type="time" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} border="none" bg="transparent" h="100%" color={PRIMARY} fontSize="sm" fontWeight="600" p={0} minW="100px" />
              </Flex>

              {/* Analyse button */}
              <UIButton onClick={handleSubmit} loading={isGeocoding} style={{ background: BLUE, color: "#fff", fontWeight: "600", borderRadius: "12px", height: "50px", padding: "0 28px", fontSize: "14px" }}>
                Analyse My Trip
              </UIButton>
            </Flex>
            {geoError && <Text color={RED} mt={2} fontSize="sm">{geoError}</Text>}
          </Box>

          {/* ── Empty State ── */}
          {!formData ? (
            <Card p={14}>
              <Flex direction="column" align="center" textAlign="center">
                <Flex w="96px" h="96px" borderRadius="full" bg="#e6fffa" align="center" justify="center" mb={5}>
                  <MapPin size={48} color={TEAL} strokeWidth={1.5} />
                </Flex>
                <Heading size="lg" color={PRIMARY} mb={3} fontWeight="700">Analyse Your Route</Heading>
                <Text color={MUTED} maxW="460px" mb={6} lineHeight="1.7" fontSize="sm">
                  Enter pickup and destination above to get cancellation risk, transport alternatives, best time to leave and cost comparison
                </Text>
                <Flex gap={3} justify="center" flexWrap="wrap">
                  {[{ label: "ML Powered", color: BLUE }, { label: "Weather Aware", color: AMBER }, { label: "Hyderabad Specific", color: TEAL }].map((item) => (
                    <Flex key={item.label} align="center" gap={2} px={4} py={2} borderRadius="full" bg={INPUT_BG} border={`1px solid ${BORDER}`} fontSize="sm" color={MUTED}>
                      <Box w={2} h={2} borderRadius="full" bg={item.color} />
                      <Text>{item.label}</Text>
                    </Flex>
                  ))}
                </Flex>
              </Flex>
            </Card>
          ) : (
            <>
              {/* ── Hero Recommendation Banner ── */}
              {alternativesQuery.isLoading ? (
                <Box className="hero-card" borderRadius="24px" overflow="hidden" style={{ background: "linear-gradient(135deg,#eef2ff 0%,#faf5ff 55%,#ecfdf5 100%)", border: "1px solid rgba(139,92,246,0.12)", boxShadow: "0 8px 40px rgba(0,0,0,0.07)" }}>
                  <Box className="hero-gradient-bar" />
                  <Box p={6}><Skeleton h="180px" borderRadius="14px" /></Box>
                </Box>
              ) : alternativesQuery.isError ? (
                <ErrorCard message="Could not load recommendations" onRetry={() => alternativesQuery.refetch()} />
              ) : bestOption ? (
                <Box
                  className="hero-card-wrap hero-card"
                  borderRadius="24px" overflow="hidden"
                  style={{
                    background: "radial-gradient(ellipse at 12% 75%,rgba(124,58,237,0.08) 0%,transparent 52%), radial-gradient(ellipse at 88% 18%,rgba(6,148,162,0.07) 0%,transparent 48%), linear-gradient(135deg,#eef2ff 0%,#faf5ff 55%,#ecfdf5 100%)",
                    border: "1px solid rgba(139,92,246,0.15)",
                    boxShadow: "0 8px 40px rgba(0,0,0,0.08), 0 0 0 1px rgba(139,92,246,0.06) inset",
                  }}
                >
                  <Box className="hero-gradient-bar" />
                  <Box p={8}>
                    {/* Header row */}
                    <Flex align="center" mb={6}>
                      <Box className="pulse-dot" w="9px" h="9px" borderRadius="full" bg={GREEN} mr={2} flexShrink={0} />
                      <Text fontSize="xs" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase">
                        ✦ Recommended Action · {timeStr}
                      </Text>
                      <Box flex={1} />
                      <span className="hero-best-badge">✦ Best Option</span>
                    </Flex>

                    {/* Mode + Booking */}
                    <Flex gap={8} align="flex-start" flexWrap="wrap">
                      {/* Left: mode info */}
                      <Box flex="1" minW="280px">
                        <Flex align="center" gap={5} mb={6}>
                          <Box
                            className="hero-mode-icon"
                            w="88px" h="88px" borderRadius="22px" flexShrink={0}
                            display="flex" alignItems="center" justifyContent="center" fontSize="3rem"
                            style={{
                              background: `linear-gradient(135deg,${modeColor(bestOption.mode)}22,${modeColor(bestOption.mode)}08)`,
                              border: `2px solid ${modeColor(bestOption.mode)}35`,
                              boxShadow: `0 6px 28px ${modeColor(bestOption.mode)}30`,
                            }}
                          >
                            {modeEmoji(bestOption.mode, bestOption.variant)}
                          </Box>
                          <Box>
                            <Text fontSize="2.4rem" fontWeight="800" color={PRIMARY} lineHeight="1" style={{ textTransform: "capitalize" }} mb={2}>
                              {bestOption.mode}{bestOption.variant ? ` · ${bestOption.variant}` : ""}
                            </Text>
                            <Text color={MUTED} fontSize="md" lineHeight="1.55">{bestOption.reason}</Text>
                          </Box>
                        </Flex>
                        <button
                          className="hero-compare-btn"
                          onClick={scrollToAlternatives}
                          style={{
                            padding: "10px 22px", borderRadius: "12px", border: "none",
                            fontSize: "14px", color: "#fff", fontWeight: 700,
                            background: "linear-gradient(135deg,#7c3aed,#1a56db)",
                            cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px",
                            boxShadow: "0 4px 18px rgba(124,58,237,0.3)",
                          }}
                        >
                          Compare all options ↓
                        </button>
                      </Box>

                      {/* Right: booking buttons */}
                      <VStack gap={3} minW="240px" align="stretch" flexShrink={0}>
                        <button
                          className="hero-btn-uber"
                          onClick={() => window.open(buildUberUrl(
                            { lat: formData!.originLat, lng: formData!.originLon, name: pickupText || "Pickup" },
                            { lat: formData!.destLat, lng: formData!.destLon, name: destText || "Destination" }
                          ), "_blank")}
                          style={{
                            background: "#000", color: "#fff", border: "none",
                            borderRadius: "14px", height: "60px",
                            fontWeight: 700, fontSize: "16px", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            gap: "12px", width: "100%",
                            boxShadow: "0 4px 18px rgba(0,0,0,0.22)",
                          }}
                        >
                          <svg width="52" height="18" viewBox="0 0 52 18" xmlns="http://www.w3.org/2000/svg">
                            <text x="0" y="14" fontFamily="'Helvetica Neue','Arial Black',Arial,sans-serif" fontWeight="800" fontSize="16" fill="white" letterSpacing="-0.5">uber</text>
                          </svg>
                          Book Uber
                        </button>
                        <button
                          className="hero-btn-ola"
                          onClick={() => window.open(buildOlaUrl(
                            { lat: formData!.originLat, lng: formData!.originLon, name: pickupText || "Pickup" },
                            { lat: formData!.destLat, lng: formData!.destLon, name: destText || "Destination" }
                          ), "_blank")}
                          style={{
                            background: "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff", border: "none",
                            borderRadius: "14px", height: "60px",
                            fontWeight: 700, fontSize: "16px", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            gap: "12px", width: "100%",
                            boxShadow: "0 4px 18px rgba(22,163,74,0.38)",
                          }}
                        >
                          <svg width="48" height="26" viewBox="0 0 48 26" xmlns="http://www.w3.org/2000/svg">
                            <rect width="48" height="26" rx="5" fill="white"/>
                            <text x="7" y="19" fontFamily="'Helvetica Neue','Arial Black',Arial,sans-serif" fontWeight="900" fontSize="14" fill="#16a34a" letterSpacing="0.5">OLA</text>
                          </svg>
                          Book Ola
                        </button>
                      </VStack>
                    </Flex>
                  </Box>

                  {/* Stats footer */}
                  <Box borderTop="1px solid rgba(139,92,246,0.1)" style={{ background: "rgba(255,255,255,0.42)", backdropFilter: "blur(6px)" }}>
                    <Grid templateColumns="repeat(4, 1fr)">
                      {([
                        {
                          label: "Risk",
                          value: predictionQuery.data?.risk_level,
                          sub: predictionQuery.data ? `${Math.round(predictionQuery.data.probability * 100)}% chance` : undefined,
                          color: predictionQuery.data ? getRiskTextColor(predictionQuery.data.risk_level) : PRIMARY,
                          capitalize: true,
                          isLoading: predictionQuery.isLoading,
                        },
                        {
                          label: "Wait",
                          value: reliabilityQuery.data ? `${reliabilityQuery.data.avg_wait_min} min` : undefined,
                          sub: reliabilityQuery.data?.label,
                          color: PRIMARY,
                          capitalize: false,
                          isLoading: reliabilityQuery.isLoading,
                        },
                        {
                          label: "Ride",
                          value: `${bestOption.time_min} min`,
                          sub: bestOption.cost_display,
                          color: PRIMARY,
                          capitalize: false,
                          isLoading: false,
                        },
                        {
                          label: "Reliability",
                          value: `${bestOption.reliability_score}/10`,
                          sub: "score",
                          color: bestOption.reliability_score >= 7 ? GREEN : bestOption.reliability_score >= 4 ? AMBER : RED,
                          capitalize: false,
                          isLoading: false,
                        },
                      ] as const).map((stat, i) => (
                        <Box
                          key={stat.label}
                          className="hero-stat-cell"
                          textAlign="center" py={6} px={3}
                          borderLeft={i > 0 ? "1px solid rgba(139,92,246,0.1)" : undefined}
                        >
                          <Text fontSize="0.7rem" color={SUBTLE} fontWeight="700" textTransform="uppercase" letterSpacing="1.2px" mb={2}>
                            {stat.label}
                          </Text>
                          {stat.isLoading ? (
                            <Skeleton h="32px" w="60%" mx="auto" borderRadius="6px" />
                          ) : stat.value ? (
                            <>
                              <Text
                                fontSize="1.9rem" fontWeight="800" lineHeight="1" mb={1} color={stat.color}
                                style={{ textTransform: stat.capitalize ? "capitalize" : undefined }}
                              >
                                {stat.value}
                              </Text>
                              {stat.sub && <Text fontSize="sm" color={SUBTLE}>{stat.sub}</Text>}
                            </>
                          ) : (
                            <Text color={MUTED} fontSize="md">—</Text>
                          )}
                        </Box>
                      ))}
                    </Grid>
                  </Box>
                </Box>
              ) : (
                <Card><Text color={MUTED}>No transport options available</Text></Card>
              )}

              {/* ── Detail Cards: Risk + Reliability ── */}
              <Box bg={CARD} borderRadius="24px" boxShadow={CARD_SHADOW} overflow="hidden">
                <Grid templateColumns={{ base: "1fr", lg: "1fr 1fr" }}>
                  {/* Cancellation Risk */}
                  <Box p={7} style={{ borderRight: `1px solid ${BORDER}` }}>
                    <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={5}>Cancellation Risk</Text>
                    {predictionQuery.isLoading ? <Skeleton h="160px" /> : predictionQuery.isError ? (
                      <ErrorCard message="Could not load" onRetry={() => predictionQuery.refetch()} />
                    ) : predictionQuery.data ? (
                      <>
                        <Flex align="center" gap={5} mb={5}>
                          <Box flexShrink={0}>
                            <svg width="84" height="84" viewBox="0 0 84 84">
                              <circle cx="42" cy="42" r="32" fill="none" stroke={BORDER} strokeWidth="8"/>
                              <circle cx="42" cy="42" r="32" fill="none"
                                stroke={getRiskBorderColor(predictionQuery.data.risk_level)}
                                strokeWidth="8"
                                strokeDasharray={`${(predictionQuery.data.probability * 201.1).toFixed(1)} 201.1`}
                                strokeLinecap="round"
                                transform="rotate(-90 42 42)"
                                style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.22,1,0.36,1)" }}
                              />
                              <text x="42" y="47" textAnchor="middle" fontSize="14" fontWeight="700"
                                fill={getRiskTextColor(predictionQuery.data.risk_level)}>
                                {Math.round(predictionQuery.data.probability * 100)}%
                              </text>
                            </svg>
                          </Box>
                          <Box>
                            <Flex align="center" gap={2} mb={2}>
                              <Box w="8px" h="8px" borderRadius="full" bg={getRiskBorderColor(predictionQuery.data.risk_level)} flexShrink={0} />
                              <Box px={3} py={1} borderRadius="full" fontSize="sm" fontWeight="700"
                                bg={predictionQuery.data.risk_level === "low" ? "#dcfce7" : predictionQuery.data.risk_level === "moderate" ? "#fef3c7" : "#fee2e2"}
                                color={getRiskTextColor(predictionQuery.data.risk_level)}>
                                {predictionQuery.data.risk_level.charAt(0).toUpperCase() + predictionQuery.data.risk_level.slice(1)} risk
                              </Box>
                            </Flex>
                            <Text fontSize="sm" color={MUTED} lineHeight="1.6">
                              Predicted by {predictionQuery.data.using_ml_model ? "XGBoost ML" : "rule-based model"}
                            </Text>
                            <Text fontSize="sm" color={MUTED}>based on your route + time</Text>
                          </Box>
                        </Flex>
                        <Grid templateColumns="1fr 1fr" gap={3}>
                          <Box bg={INPUT_BG} borderRadius="14px" p={4}>
                            <Text fontSize="xs" color={MUTED} mb={1}>Probability</Text>
                            <Text fontSize="xl" fontWeight="800" color={PRIMARY}>{Math.round(predictionQuery.data.probability * 100)}%</Text>
                          </Box>
                          <Box bg={INPUT_BG} borderRadius="14px" p={4}>
                            <Text fontSize="xs" color={MUTED} mb={1}>Model</Text>
                            <Text fontSize="xl" fontWeight="800" color={PRIMARY}>{predictionQuery.data.using_ml_model ? "XGBoost" : "Rules"}</Text>
                          </Box>
                        </Grid>
                      </>
                    ) : null}
                  </Box>

                  {/* Route Reliability */}
                  <Box p={7}>
                    <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={5}>Route Reliability</Text>
                    {reliabilityQuery.isLoading ? <Skeleton h="160px" /> : reliabilityQuery.isError ? (
                      <ErrorCard message="Could not load" onRetry={() => reliabilityQuery.refetch()} />
                    ) : reliabilityQuery.data ? (
                      <>
                        <Flex align="flex-end" gap={2} mb={5}>
                          <Text fontSize="5rem" fontWeight="800" lineHeight="1"
                            color={reliabilityQuery.data.score >= 7 ? GREEN : reliabilityQuery.data.score >= 4 ? AMBER : RED}>
                            {reliabilityQuery.data.score}
                          </Text>
                          <Box mb={2}>
                            <Text color={MUTED} fontSize="md">/10</Text>
                            <Text fontWeight="700" fontSize="sm"
                              color={reliabilityQuery.data.score >= 7 ? GREEN : reliabilityQuery.data.score >= 4 ? AMBER : RED}>
                              {reliabilityQuery.data.label}
                            </Text>
                          </Box>
                        </Flex>
                        <VStack gap={4} align="stretch">
                          {[
                            { label: "Cancellation rate", value: `${Math.round(reliabilityQuery.data.cancel_rate * 100)}%`, w: reliabilityQuery.data.cancel_rate * 100, color: RED },
                            { label: "Avg wait time", value: `${reliabilityQuery.data.avg_wait_min} min`, w: Math.min(reliabilityQuery.data.avg_wait_min * 5, 100), color: AMBER },
                            { label: "Reliability score", value: `${Math.round(reliabilityQuery.data.score * 10)}%`, w: reliabilityQuery.data.score * 10, color: BLUE },
                          ].map((row) => (
                            <Box key={row.label}>
                              <Flex justify="space-between" mb={1.5}>
                                <Text fontSize="sm" color={MUTED}>{row.label}</Text>
                                <Text fontSize="sm" fontWeight="700" color={row.color}>{row.value}</Text>
                              </Flex>
                              <Box h="6px" bg={BORDER} borderRadius="full" overflow="hidden">
                                <Box h="100%" bg={row.color} w={`${row.w}%`} borderRadius="full"
                                  style={{ transition: "width 1.2s cubic-bezier(0.22,1,0.36,1)" }} />
                              </Box>
                            </Box>
                          ))}
                        </VStack>
                      </>
                    ) : null}
                  </Box>
                </Grid>
              </Box>

              {/* ── Transport Options ── */}
              <Box ref={alternativesRef}>
                <Flex align="center" justify="space-between" flexWrap="wrap" gap={4} mb={2}>
                  <Box>
                    <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={1}>Weigh your options</Text>
                    <Heading size="lg" color={PRIMARY} fontWeight="800">Every way there, at a glance</Heading>
                  </Box>
                  <Flex bg={CARD} borderRadius="12px" p={1} gap={1} style={{ border: `1px solid ${BORDER}`, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                    {(["best", "fastest", "cheapest"] as const).map((mode) => (
                      <Box
                        key={mode} as="button" onClick={() => setSortMode(mode)}
                        px={4} py={2} borderRadius="9px" cursor="pointer" fontWeight="600" fontSize="sm"
                        display="flex" alignItems="center" gap={1.5}
                        style={{
                          background: sortMode === mode ? BLUE : "transparent",
                          color: sortMode === mode ? "#fff" : MUTED,
                          border: "none",
                          boxShadow: sortMode === mode ? "0 2px 8px rgba(26,86,219,0.35)" : "none",
                          transition: "all 0.22s cubic-bezier(0.34,1.56,0.64,1)",
                        }}
                      >
                        {mode === "best" ? "★" : mode === "fastest" ? "⚡" : "💰"} {mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </Box>
                    ))}
                  </Flex>
                </Flex>

                <Text fontSize="xs" color={SUBTLE} textTransform="uppercase" letterSpacing="1px" fontWeight="600" mb={4}>
                  Ranked by {sortMode} fit
                </Text>

                {alternativesQuery.isLoading ? (
                  <VStack gap={3}>
                    <Skeleton h="64px" borderRadius="14px" />
                    <Skeleton h="64px" borderRadius="14px" />
                    <Skeleton h="64px" borderRadius="14px" />
                  </VStack>
                ) : alternativesQuery.isError ? (
                  <ErrorCard message="Could not load options — check backend" onRetry={() => alternativesQuery.refetch()} />
                ) : alternativesQuery.data ? (() => {
                  const riskOrderMap: Record<string, number> = { low: 0, moderate: 1, high: 2 }
                  const availOpts = alternativesQuery.data.options.filter((o) => o.available)
                  const maxCost = Math.max(...availOpts.map((o) => o.cost_inr), 1)
                  const maxTime = Math.max(...availOpts.map((o) => o.time_min), 1)
                  const bestScore = (o: (typeof availOpts)[0]) =>
                    ((riskOrderMap[o.risk_level] ?? 1) / 2) * 0.35 + (o.cost_inr / maxCost) * 0.35 + (o.time_min / maxTime) * 0.30

                  const sorted = [...alternativesQuery.data.options].sort((a, b) => {
                    if (a === bestOption) return -1
                    if (b === bestOption) return 1
                    if (a.available && !b.available) return -1
                    if (!a.available && b.available) return 1
                    if (sortMode === "best") return bestScore(a) - bestScore(b)
                    return sortMode === "cheapest" ? a.cost_inr - b.cost_inr : a.time_min - b.time_min
                  })

                  return (
                    <Box>
                      {sorted.map((opt, i) => {
                        const isBest = opt === bestOption
                        const isUnavailable = !opt.available
                        const isHighRisk = opt.risk_level === "high" && !isUnavailable
                        const color = modeColor(opt.mode)
                        const isLast = i === sorted.length - 1
                        return (
                          <Box
                            key={i} className="alt-row" px={4} py={3.5}
                            borderBottom={isLast ? "none" : `1px solid rgba(226,232,240,0.6)`}
                            opacity={isUnavailable ? 0.45 : 1}
                            style={{ background: isBest ? "rgba(16,185,129,0.05)" : "transparent" }}
                          >
                            <Flex align="center" gap={4}>
                              <Text color={SUBTLE} fontSize="sm" fontWeight="700" w="22px" textAlign="center" flexShrink={0}>
                                {i + 1}
                              </Text>
                              <Flex w="48px" h="48px" borderRadius="14px" align="center" justify="center" fontSize="1.5rem" flexShrink={0}
                                style={{ background: `${color}15`, border: `1.5px solid ${color}25` }}>
                                {modeEmoji(opt.mode, opt.variant)}
                              </Flex>
                              <Box flex={1}>
                                <Flex align="center" gap={2} mb={0.5} flexWrap="wrap">
                                  <Text fontWeight="700" color={isUnavailable ? MUTED : PRIMARY} textTransform="capitalize" fontSize="md">
                                    {opt.vehicles_needed > 1 ? `${opt.vehicles_needed}× ` : ""}{opt.mode}{opt.variant ? ` · ${opt.variant}` : ""}
                                  </Text>
                                  {isBest && <Box px={2} py={0.5} borderRadius="5px" bg={BLUE} color="white" fontSize="0.6rem" fontWeight="800" letterSpacing="0.05em">BEST</Box>}
                                  {isUnavailable && <Box px={2} py={0.5} borderRadius="5px" bg={INPUT_BG} color={MUTED} fontSize="0.6rem" fontWeight="700">UNAVAILABLE</Box>}
                                  {isHighRisk && <Box px={2} py={0.5} borderRadius="5px" bg="#fee2e2" color={RED} fontSize="0.6rem" fontWeight="700">HIGH RISK</Box>}
                                </Flex>
                                <Text fontSize="xs" color={MUTED}>{opt.reason}</Text>
                              </Box>
                              <Box textAlign="right" flexShrink={0}>
                                <Text fontWeight="700" fontSize="md" color={isUnavailable ? MUTED : PRIMARY}>{opt.cost_display}</Text>
                                <Text fontSize="xs" color={MUTED}>{opt.time_min} min · {opt.reliability_score}/10</Text>
                              </Box>
                            </Flex>
                          </Box>
                        )
                      })}
                    </Box>
                  )
                })() : null}
              </Box>

              {/* ── Cost Breakdown ── */}
              <Card>
                <CardLabel>Cost Breakdown</CardLabel>
                {costQuery.isLoading ? <Skeleton h="200px" /> : costQuery.isError ? <ErrorCard message="Could not load data — check backend connection" onRetry={() => costQuery.refetch()} /> : costQuery.data ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={costQuery.data.costs.filter((c) => c.available).map((c) => ({ name: c.mode + (c.variant ? ` (${c.variant})` : ""), cost: Math.round(c.final_cost_inr) }))} layout="vertical" margin={{ left: 110, right: 40, top: 5, bottom: 5 }}>
                      <XAxis type="number" tick={{ fill: MUTED, fontSize: 12 }} tickFormatter={(v: number) => `₹${v}`} />
                      <YAxis type="category" dataKey="name" tick={{ fill: MUTED, fontSize: 12 }} width={110} />
                      <Tooltip formatter={(v) => [`₹${v ?? ""}`, "Final Cost"]} />
                      <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                        {costQuery.data.costs.filter((c) => c.available).map((_, i) => <Cell key={i} fill={COST_COLORS[i % COST_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : null}
              </Card>

              {/* ── Best Time to Leave ── */}
              <Box bg={CARD} borderRadius="24px" boxShadow={CARD_SHADOW} p={7}>
                <Flex align="flex-start" justify="space-between" mb={6} flexWrap="wrap" gap={3}>
                  <Box>
                    <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={1}>Timing Intelligence</Text>
                    <Heading size="lg" color={PRIMARY} fontWeight="800">When the streets forgive you</Heading>
                  </Box>
                  <Flex align="center" gap={2}>
                    <Box w="10px" h="10px" borderRadius="full" bg={GREEN} />
                    <Text fontSize="xs" color={MUTED}>Lower curve = fewer cancellations</Text>
                  </Flex>
                </Flex>

                {bestTimeQuery.isLoading ? (
                  <Skeleton h="200px" borderRadius="12px" />
                ) : bestTimeQuery.isError ? (
                  <ErrorCard message="Could not load — check backend" onRetry={() => bestTimeQuery.refetch()} />
                ) : bestTimeQuery.data ? (() => {
                  const slots = bestTimeQuery.data.slots
                  const bestSlot = bestTimeQuery.data.best_slot
                  const currentSlot = slots[0]
                  const chartData = slots.map((s) => ({
                    time: s.time_label,
                    rate: Math.round(s.cancel_risk * 100),
                    isBest: s.time_label === bestSlot?.time_label,
                  }))
                  return (
                    <>
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={chartData} margin={{ top: 36, right: 20, bottom: 4, left: 0 }}>
                          <defs>
                            <linearGradient id="cancelGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={TEAL} stopOpacity={0.22} />
                              <stop offset="100%" stopColor={TEAL} stopOpacity={0.01} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="time" tick={{ fontSize: 13, fill: MUTED, fontWeight: 600 }} axisLine={false} tickLine={false} />
                          <YAxis hide domain={[0, 100]} />
                          <Tooltip formatter={(v) => [`${v}%`, "Cancel risk"]} contentStyle={{ borderRadius: "10px", border: `1px solid ${BORDER}`, fontSize: "13px" }} />
                          <Area
                            type="monotone" dataKey="rate" stroke={TEAL} strokeWidth={2.5}
                            fill="url(#cancelGrad)"
                            activeDot={{ r: 6, fill: TEAL, stroke: "white", strokeWidth: 2 }}
                            dot={(dotProps: any) => {
                              const { cx, cy, index } = dotProps
                              if (index >= chartData.length) return <g key={index} />
                              const d = chartData[index]
                              const isBest = d.isBest
                              const isCurrent = index === 0
                              const labelColor = isBest ? GREEN : isCurrent ? BLUE : "#555"
                              return (
                                <g key={index}>
                                  {isBest && <circle cx={cx} cy={cy} r={16} fill="none" stroke={GREEN} strokeWidth={2} opacity={0.45} />}
                                  <circle cx={cx} cy={cy} r={isBest || isCurrent ? 7 : 4}
                                    fill={isCurrent && !isBest ? "transparent" : isBest ? GREEN : "white"}
                                    stroke={isBest ? GREEN : isCurrent ? BLUE : SUBTLE}
                                    strokeWidth={isBest || isCurrent ? 2.5 : 1.5}
                                  />
                                  <text x={cx} y={cy - (isBest ? 28 : 18)} textAnchor="middle" fontSize="12" fontWeight="700" fill={labelColor}>
                                    {d.rate}%
                                  </text>
                                </g>
                              )
                            }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                      <Flex align="center" gap={2} flexWrap="wrap" mt={4} pt={4} borderTop={`1px solid ${BORDER}`}>
                        <Box w="14px" h="14px" borderRadius="3px" bg={GREEN} flexShrink={0} />
                        <Text fontSize="sm" color={PRIMARY} lineHeight="1.6">
                          Leaving at{" "}
                          <Text as="span" color={BLUE} fontWeight="700">{currentSlot?.time_label}</Text>
                          {" "}gives you a{" "}
                          <Text as="span" color={AMBER} fontWeight="700">{Math.round((currentSlot?.cancel_risk ?? 0) * 100)}% cancellation rate</Text>
                          {bestSlot && bestSlot.time_label !== currentSlot?.time_label && (
                            <> · Best window today is{" "}
                              <Text as="span" color={GREEN} fontWeight="700">{bestSlot.time_label}</Text>
                              {" "}at just {Math.round(bestSlot.cancel_risk * 100)}%.
                            </>
                          )}
                          {bestSlot && bestSlot.time_label === currentSlot?.time_label && (
                            <> · You're already at the best time to leave!</>
                          )}
                        </Text>
                      </Flex>
                    </>
                  )
                })() : null}
              </Box>

              {/* ── Nearest Transit Stops ── */}
              <Card>
                <CardLabel>Nearest Transit Stops</CardLabel>
                {pickupQuery.isLoading ? <Skeleton h="120px" /> : pickupQuery.isError ? <ErrorCard message="Could not load data — check backend connection" onRetry={() => pickupQuery.refetch()} /> : pickupQuery.data?.suggestions.length ? (
                  <VStack gap={2} align="stretch">
                    {pickupQuery.data.suggestions.slice(0, 5).map((stop, i) => (
                      <Flex key={i} align="center" gap={4} p={3} bg={INPUT_BG} borderRadius="10px" border={`1px solid ${BORDER}`} cursor="pointer" _hover={{ bg: BORDER }} transition="background 0.15s"
                        onClick={async () => {
                          setSelectedStop(stop)
                          setIsLoadingSchedule(true)
                          try {
                            const data = await getBusStopSchedule(stop.name, formData?.hour)
                            setScheduleData(data)
                          } catch (err) {
                            console.error(err)
                            setScheduleData({ error: "Failed to load schedule" })
                          }
                          setIsLoadingSchedule(false)
                        }}
                      >
                        <Text fontSize="xl">{stop.stop_type === "metro" ? "🚇" : stop.stop_type === "mmts" ? "🚂" : "🚌"}</Text>
                        <Box flex="1">
                          <Text fontWeight="600" color={PRIMARY} fontSize="sm">{stop.name}</Text>
                          <Text fontSize="xs" color={MUTED}>{stop.distance_m}m away · {stop.walk_min} min walk</Text>
                        </Box>
                        <Box display="inline-block" px={2} py={0.5} borderRadius="full" bg="#e6fffa" color={TEAL} fontSize="0.7rem" fontWeight="700">↓{stop.risk_reduction_pct}% risk</Box>
                      </Flex>
                    ))}
                  </VStack>
                ) : <Text color={MUTED} fontSize="sm">No transit stops found nearby</Text>}
              </Card>
            </>
          )}
        </VStack>

        {/* ── Bus Stop Schedule Dialog ── */}
        <Dialog.Root open={!!selectedStop} onOpenChange={(e) => { if (!e.open) setSelectedStop(null) }}>
          <Portal>
            <Dialog.Backdrop />
            <Dialog.Positioner>
              <Dialog.Content style={{ background: "#ffffff", borderRadius: "16px" }}>
                <Dialog.Header>
                  <Dialog.Title>{selectedStop?.name} Schedule</Dialog.Title>
                </Dialog.Header>
                <Dialog.Body>
                  {isLoadingSchedule ? (
                    <VStack gap={3}><Skeleton h="56px" /><Skeleton h="56px" /><Skeleton h="56px" /></VStack>
                  ) : scheduleData?.error ? (
                    <Text color={RED} fontSize="sm">{scheduleData.error}</Text>
                  ) : scheduleData?.routes?.length ? (
                    <VStack gap={2} align="stretch">
                      {scheduleData.routes.map((route, i) => (
                        <Flex key={i} align="center" justify="space-between" p={3} bg={INPUT_BG} borderRadius="8px" border={`1px solid ${BORDER}`}>
                          <Flex align="center" gap={3}>
                            <Box px={2} py={1} borderRadius="4px" bg={i % 2 === 0 ? "#E1F5EE" : "#E6F1FB"} color={i % 2 === 0 ? "#0F6E56" : "#185FA5"} fontSize="xs" fontWeight="700" minW="32px" textAlign="center">
                              {route.route_name}
                            </Box>
                            <Text fontWeight="600" fontSize="sm" color={PRIMARY}>{route.destination}</Text>
                          </Flex>
                          <Text fontSize="xs" color={TEAL} fontWeight="600" ml={3}>{route.next_arrival}</Text>
                        </Flex>
                      ))}
                    </VStack>
                  ) : (
                    <Text color={MUTED} fontSize="sm">No schedule data available for this stop.</Text>
                  )}
                </Dialog.Body>
                <Dialog.Footer>
                  <Button onClick={() => setSelectedStop(null)}>Close</Button>
                </Dialog.Footer>
              </Dialog.Content>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>
      </Container>

      <TripPlannerModal
        isOpen={plannerOpen}
        onClose={() => setPlannerOpen(false)}
        initialOrigin={pickupText}
        initialDest={destText}
        initialOriginLat={formData?.originLat}
        initialOriginLon={formData?.originLon}
        initialDestLat={formData?.destLat}
        initialDestLon={formData?.destLon}
      />
    </Box>
  )
}