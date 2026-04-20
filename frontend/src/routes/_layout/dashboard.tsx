import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Badge,
  Box,
  Container,
  Flex,
  Grid,
  Input,
  Text,
  VStack,
  Heading,
} from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import {
  AlertTriangle,
  Clock,
  Navigation,
  Cloud,
  MapPin,
  Train,
  Bus,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react"
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import {
  type PredictRequest,
  type WeatherImpactResponse,
  type PickupSuggestion,
  geocode,
  getAlternatives,
  getBestTime,
  getJourneyCost,
  getOptimalPickup,
  getRouteReliability,
  getWeatherImpact,
  predictCancellation,
} from "@/lib/api"

export const Route = createFileRoute("/_layout/dashboard")({
  component: Dashboard,
})

// ── Types ──────────────────────────────────────────────────────
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

// ── Theme ──────────────────────────────────────────────────────
const RED = "#B91C1C"
const RED_LIGHT = "#fde8e8"
const GOLD = "#D97706"
const GOLD_LIGHT = "#fef3c7"
const GREEN = "#16a34a"
const GREEN_LIGHT = "#dcfce7"
const BLUE = "#2563eb"
const TEAL = "#0694a2"
const PAGE_BG = "#f5f5f4"
const CARD = "#ffffff"
const BORDER = "#e5e7eb"
const PRIMARY = "#111827"
const MUTED = "#6b7280"
const SUBTLE = "#9ca3af"
const INPUT_BG = "#f9fafb"
const COST_COLORS = [RED, GOLD, BLUE, GREEN, "#9f7aea", TEAL]

// Spring easing — gives a playful bounce overshoot
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)"
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)"

const MODE_EMOJI: Record<string, string> = {
  metro: "🚇", bus: "🚌", auto: "🛺", cab: "🚗",
  "cab-mini": "🚗", "cab-sedan": "🚗", "cab-suv": "🚙", bike: "🛵",
}
const MODE_COLOR: Record<string, string> = {
  metro: TEAL, auto: "#f97316", bus: "#92400e",
  bike: "#7c3aed", cab: "#6b7280",
  "cab-mini": "#6b7280", "cab-sedan": "#6b7280", "cab-suv": "#6b7280",
}

function modeEmoji(mode: string, variant?: string | null) {
  return MODE_EMOJI[variant ? `${mode}-${variant}` : mode] ?? MODE_EMOJI[mode] ?? "🚌"
}
function modeColor(mode: string) { return MODE_COLOR[mode] ?? "#6b7280" }
function riskColor(level: string) {
  if (level === "low") return GREEN
  if (level === "moderate" || level === "medium") return GOLD
  return RED
}
function riskBg(level: string) {
  if (level === "low") return GREEN_LIGHT
  if (level === "moderate" || level === "medium") return GOLD_LIGHT
  return RED_LIGHT
}
function riskPalette(level: string): string {
  if (level === "low") return "green"
  if (level === "moderate" || level === "medium") return "yellow"
  return "red"
}

// ── Sub-components ─────────────────────────────────────────────

/** Card that lifts and glows on hover */
function Card({
  children,
  topColor,
  p = 6,
  glowColor,
}: {
  children: React.ReactNode
  topColor?: string
  p?: number
  glowColor?: string
}) {
  const shadow = "0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)"
  const hoverShadow = glowColor
    ? `0 8px 28px rgba(0,0,0,0.1), 0 0 0 1px ${glowColor}18, 0 4px 20px ${glowColor}22`
    : "0 8px 28px rgba(0,0,0,0.11)"
  return (
    <Box
      bg={CARD}
      borderRadius="14px"
      p={p}
      borderTop={topColor ? `3px solid ${topColor}` : undefined}
      style={{ boxShadow: shadow, transition: `box-shadow 0.22s ${EASE}, transform 0.25s ${SPRING}` }}
      _hover={{ transform: "translateY(-3px)", style: { boxShadow: hoverShadow } } as any}
    >
      {children}
    </Box>
  )
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      fontSize="0.62rem"
      color={MUTED}
      fontWeight="700"
      letterSpacing="1.5px"
      textTransform="uppercase"
      mb={3}
    >
      {children}
    </Text>
  )
}

function IconCircle({ icon, color, bg }: { icon: React.ReactNode; color: string; bg: string }) {
  return (
    <Flex
      w="32px" h="32px" borderRadius="full" bg={bg}
      align="center" justify="center" mb={3}
      style={{ color, transition: `transform 0.25s ${SPRING}` }}
      _hover={{ transform: "scale(1.2) rotate(8deg)" } as any}
    >
      {icon}
    </Flex>
  )
}

function WeatherIcon({ data }: { data: WeatherImpactResponse }) {
  if (data.is_raining) return <Text fontSize="2xl">🌧️</Text>
  if (data.temperature_c > 35) return <Text fontSize="2xl">🌡️</Text>
  return <Text fontSize="2xl">☀️</Text>
}

/** Animated SVG ring for risk probability */
function RiskGauge({ probability, riskLevel }: { probability: number; riskLevel: string }) {
  const r = 30
  const circ = 2 * Math.PI * r
  const color = riskColor(riskLevel)
  const offset = circ * (1 - Math.min(probability, 1))
  return (
    <Box
      position="relative"
      w="80px"
      h="80px"
      flexShrink={0}
      style={{ transition: `transform 0.25s ${SPRING}` }}
      _hover={{ transform: "scale(1.1)" } as any}
      cursor="default"
    >
      <svg width="80" height="80" viewBox="0 0 80 80" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="#f3f4f6" strokeWidth="8" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.2s ease, stroke 0.4s ease" }}
        />
      </svg>
      <Flex
        position="absolute" top="0" left="0" w="80px" h="80px"
        align="center" justify="center"
      >
        <Text fontSize="sm" fontWeight="700" color={color} lineHeight="1">
          {Math.round(probability * 100)}%
        </Text>
      </Flex>
    </Box>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────
function Dashboard() {
  const [pickupText, setPickupText] = useState("")
  const [destText, setDestText] = useState("")
  const [passengers, setPassengers] = useState(1)
  const [timeStr, setTimeStr] = useState("08:00")
  const [formData, setFormData] = useState<FormData | null>(null)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [geoError, setGeoError] = useState("")
  // Interactive states
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [expandedFactor, setExpandedFactor] = useState<number | null>(null)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<number | null>(null)

  const handleSubmit = async () => {
    if (!pickupText || !destText) return
    setIsGeocoding(true)
    setGeoError("")
    setSelectedIdx(null)
    setExpandedFactor(null)
    setSelectedTimeSlot(null)
    try {
      const [pickup, dest] = await Promise.all([geocode(pickupText), geocode(destText)])
      const h = parseInt(timeStr.split(":")[0], 10)
      const now = new Date()
      const jsDay = now.getDay()
      const dow = jsDay === 0 ? 6 : jsDay - 1
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

  // ── Queries ──────────────────────────────────────────────────
  const weatherQuery = useQuery({
    queryKey: ["weather"],
    queryFn: getWeatherImpact,
    staleTime: 15 * 60 * 1000,
  })
  const predictionQuery = useQuery({
    queryKey: ["prediction", formData],
    queryFn: () => {
      const fd = formData!
      const payload: PredictRequest = {
        origin_lat: fd.originLat, origin_lon: fd.originLon,
        dest_lat: fd.destLat, dest_lon: fd.destLon,
        hour: fd.hour, day_of_week: fd.dayOfWeek, month: fd.month,
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
      return getJourneyCost({
        origin_lat: formData!.originLat, origin_lon: formData!.originLon,
        dest_lat: formData!.destLat, dest_lon: formData!.destLon,
        passengers: formData!.passengers,
        datetime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), formData!.hour, 0, 0).toISOString(),
      })
    },
    enabled: !!formData,
  })
  const pickupQuery = useQuery({
    queryKey: ["pickup", formData],
    queryFn: () => getOptimalPickup({
      origin_lat: formData!.originLat, origin_lon: formData!.originLon, radius_m: 1000,
    }),
    enabled: !!formData,
  })

  // ── Computed ─────────────────────────────────────────────────
  const availableOptions = alternativesQuery.data?.options.filter((o) => o.available) ?? []
  const bestOption = (() => {
    if (!availableOptions.length) return undefined
    const riskOrder: Record<string, number> = { low: 0, moderate: 1, medium: 1, high: 2 }
    // Never pick something more than 2× the fastest as "best" — cheap price can't justify 2× travel time
    const minTime = Math.min(...availableOptions.map((o) => o.time_min))
    const pool = availableOptions.filter((o) => o.time_min <= minTime * 2.0)
    const candidates = pool.length > 0 ? pool : availableOptions
    const maxCost = Math.max(...candidates.map((o) => o.cost_inr), 1)
    const maxTime = Math.max(...candidates.map((o) => o.time_min), 1)
    return [...candidates].sort((a, b) => {
      const score = (o: typeof a) =>
        0.50 * (o.time_min / maxTime) +
        0.30 * (o.cost_inr / maxCost) +
        0.10 * ((riskOrder[o.risk_level] ?? 1) / 2) +
        0.10 * (1 - o.reliability_score / 10)
      return score(a) - score(b)
    })[0]
  })()
  const savings = (() => {
    if (!availableOptions.length || !bestOption) return null
    const maxCost = Math.max(...availableOptions.map((o) => o.cost_inr))
    const saved = Math.round(maxCost - bestOption.cost_inr)
    return saved > 0 ? saved : null
  })()

  // Deduplicate transit stops by name, split by type
  const rawStops = pickupQuery.data?.suggestions ?? []
  const uniqueStops = rawStops.reduce<PickupSuggestion[]>((acc, s) => {
    if (!acc.find((x) => x.name === s.name)) acc.push(s)
    return acc
  }, [])
  const metroStops = uniqueStops.filter((s) => s.stop_type === "metro" || s.stop_type === "mmts")
  const busStops = uniqueStops.filter((s) => s.stop_type === "bus").slice(0, 5)

  // ── Render ───────────────────────────────────────────────────
  return (
    <Box bg={PAGE_BG} minH="100vh">
      <Container maxW="full" p={6}>
        <VStack gap={5} align="stretch">

          {/* ── Input Bar ── */}
          <Box
            bg={CARD}
            borderRadius="14px"
            p={6}
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)" }}
          >
            <Grid
              templateColumns={{ base: "1fr", md: "1fr 1fr 80px 120px auto" }}
              gap={4}
              alignItems="end"
            >
              <Field label="PICKUP">
                <Input
                  placeholder="e.g. Ameerpet"
                  value={pickupText}
                  onChange={(e) => setPickupText(e.target.value)}
                  bg={INPUT_BG}
                  borderRadius="8px"
                  color={PRIMARY}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  style={{ transition: `box-shadow 0.2s ${EASE}, border-color 0.2s ${EASE}` }}
                  _focus={{ borderColor: RED, boxShadow: `0 0 0 3px ${RED}18` } as any}
                />
              </Field>
              <Field label="DESTINATION">
                <Input
                  placeholder="e.g. Gachibowli"
                  value={destText}
                  onChange={(e) => setDestText(e.target.value)}
                  bg={INPUT_BG}
                  borderRadius="8px"
                  color={PRIMARY}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  style={{ transition: `box-shadow 0.2s ${EASE}, border-color 0.2s ${EASE}` }}
                  _focus={{ borderColor: RED, boxShadow: `0 0 0 3px ${RED}18` } as any}
                />
              </Field>
              <Field label="PAX">
                <Input
                  type="number" min={1} max={12} value={passengers}
                  onChange={(e) => setPassengers(Number(e.target.value))}
                  bg={INPUT_BG} borderRadius="8px" color={PRIMARY}
                  _focus={{ borderColor: RED, boxShadow: `0 0 0 3px ${RED}18` } as any}
                />
              </Field>
              <Field label="TIME">
                <Input
                  type="time" value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                  bg={INPUT_BG} borderRadius="8px" color={PRIMARY}
                  _focus={{ borderColor: RED, boxShadow: `0 0 0 3px ${RED}18` } as any}
                />
              </Field>
              <Button
                onClick={handleSubmit}
                loading={isGeocoding}
                size="lg"
                mt={4}
                style={{
                  background: RED,
                  color: "#fff",
                  fontWeight: "700",
                  borderRadius: "8px",
                  padding: "12px 28px",
                  transition: `all 0.22s ${SPRING}`,
                  boxShadow: `0 4px 12px ${RED}40`,
                }}
                _hover={{ transform: "translateY(-2px) scale(1.03)", style: { boxShadow: `0 8px 24px ${RED}50` } } as any}
                _active={{ transform: "scale(0.96) translateY(0)" } as any}
              >
                Analyse Trip
              </Button>
            </Grid>
            {geoError && <Text color={RED} mt={2} fontSize="sm">{geoError}</Text>}
          </Box>

          {/* ── Empty State ── */}
          {!formData ? (
            <Box
              bg={CARD} borderRadius="14px" p={14}
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)" }}
            >
              <Flex direction="column" align="center" textAlign="center">
                <Box
                  style={{ transition: `transform 0.35s ${SPRING}` }}
                  _hover={{ transform: "scale(1.12) rotate(-6deg)" } as any}
                  mb={5}
                >
                  <Flex
                    w="96px" h="96px" borderRadius="full" bg={RED_LIGHT}
                    align="center" justify="center"
                  >
                    <MapPin size={48} color={RED} strokeWidth={1.5} />
                  </Flex>
                </Box>
                <Heading size="lg" color={PRIMARY} mb={3} fontWeight="700">
                  Analyse Your Route
                </Heading>
                <Text color={MUTED} maxW="460px" mb={6} lineHeight="1.7" fontSize="sm">
                  Enter pickup and destination above to get cancellation risk,
                  transport alternatives, best time to leave and cost comparison
                </Text>
                <Flex gap={3} justify="center" flexWrap="wrap">
                  {[
                    { dot: RED, label: "ML Powered" },
                    { dot: GOLD, label: "Weather Aware" },
                    { dot: TEAL, label: "Hyderabad Specific" },
                  ].map(({ dot, label }) => (
                    <Flex
                      key={label}
                      align="center" gap={2} px={4} py={2} borderRadius="full"
                      bg={INPUT_BG} border={`1px solid ${BORDER}`} fontSize="sm" color={MUTED}
                      cursor="default"
                      style={{ transition: `all 0.2s ${EASE}` }}
                      _hover={{ transform: "scale(1.05)", bg: "white", borderColor: dot, color: dot } as any}
                    >
                      <Box w={2} h={2} borderRadius="full" bg={dot} />
                      <Text>{label}</Text>
                    </Flex>
                  ))}
                </Flex>
              </Flex>
            </Box>
          ) : (
            <>
              {/* ── 4 Stat Cards ── */}
              <Grid templateColumns={{ base: "1fr 1fr", lg: "repeat(4, 1fr)" }} gap={4}>
                {[
                  {
                    topColor: RED,
                    icon: <AlertTriangle size={15} />,
                    iconBg: RED_LIGHT,
                    label: "Cancellation Risk",
                    loading: predictionQuery.isLoading,
                    value: predictionQuery.data
                      ? predictionQuery.data.risk_level.toUpperCase()
                      : "—",
                    sub: predictionQuery.data
                      ? `${Math.round(predictionQuery.data.probability * 100)}% probability`
                      : "",
                    valueColor: predictionQuery.data
                      ? riskColor(predictionQuery.data.risk_level)
                      : MUTED,
                  },
                  {
                    topColor: BLUE,
                    icon: <Clock size={15} />,
                    iconBg: "#eff6ff",
                    label: "Real Wait Time",
                    loading: reliabilityQuery.isLoading,
                    value: reliabilityQuery.data ? `${reliabilityQuery.data.avg_wait_min} min` : "—",
                    sub: reliabilityQuery.data ? `avg · ${reliabilityQuery.data.label}` : "",
                    valueColor: BLUE,
                  },
                  {
                    topColor: GREEN,
                    icon: <Navigation size={15} />,
                    iconBg: GREEN_LIGHT,
                    label: "Best Mode Now",
                    loading: alternativesQuery.isLoading,
                    value: bestOption
                      ? `${modeEmoji(bestOption.mode, bestOption.variant)} ${bestOption.mode}`
                      : "—",
                    sub: bestOption
                      ? savings != null ? `Saves ₹${savings}` : bestOption.reason.slice(0, 28)
                      : "",
                    valueColor: TEAL,
                  },
                  {
                    topColor: GOLD,
                    icon: <Cloud size={15} />,
                    iconBg: GOLD_LIGHT,
                    label: "Weather Impact",
                    loading: weatherQuery.isLoading,
                    value: weatherQuery.data
                      ? weatherQuery.data.conditions.split(" ")[0]
                      : "—",
                    sub: weatherQuery.data
                      ? `${weatherQuery.data.temperature_c}°C · ${weatherQuery.data.windspeed_kmh} km/h`
                      : "",
                    valueColor: GOLD,
                  },
                ].map((card) => (
                  <Box
                    key={card.label}
                    bg={CARD}
                    borderRadius="14px"
                    p={6}
                    borderTop={`3px solid ${card.topColor}`}
                    cursor="default"
                    style={{
                      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)",
                      transition: `box-shadow 0.25s ${EASE}, transform 0.28s ${SPRING}`,
                    }}
                    _hover={{
                      transform: "translateY(-5px) scale(1.01)",
                      style: { boxShadow: `0 12px 36px ${card.topColor}28` },
                    } as any}
                  >
                    <IconCircle icon={card.icon} color={card.topColor} bg={card.iconBg} />
                    <CardLabel>{card.label}</CardLabel>
                    {card.loading ? (
                      <Skeleton h="40px" />
                    ) : (
                      <>
                        <Text
                          fontSize="1.75rem"
                          fontWeight="700"
                          color={card.valueColor}
                          lineHeight="1"
                          mb={1}
                          textTransform="capitalize"
                          style={{ transition: `color 0.3s ${EASE}` }}
                        >
                          {card.value}
                        </Text>
                        <Text fontSize="0.75rem" color={SUBTLE}>{card.sub}</Text>
                      </>
                    )}
                  </Box>
                ))}
              </Grid>

              {/* ── Recommendation Banner ── */}
              <Box
                bg={CARD}
                borderRadius="14px"
                p={6}
                borderTop={`3px solid ${bestOption ? riskColor(bestOption.risk_level) : RED}`}
                style={{
                  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)",
                  transition: `all 0.25s ${SPRING}`,
                }}
                _hover={{ transform: "translateY(-2px)", style: { boxShadow: "0 10px 30px rgba(0,0,0,0.1)" } } as any}
              >
                {alternativesQuery.isLoading ? (
                  <Skeleton h="80px" />
                ) : bestOption ? (
                  <Flex align="center" gap={5} wrap="wrap">
                    <Box
                      style={{ transition: `transform 0.3s ${SPRING}` }}
                      _hover={{ transform: "scale(1.15) rotate(5deg)" } as any}
                    >
                      <Flex
                        w="56px" h="56px" borderRadius="full" align="center" justify="center"
                        fontSize="2rem" bg={`${modeColor(bestOption.mode)}18`}
                        border={`1.5px solid ${modeColor(bestOption.mode)}35`}
                      >
                        {modeEmoji(bestOption.mode, bestOption.variant)}
                      </Flex>
                    </Box>
                    <Box flex="1" minW="200px">
                      <Flex align="center" gap={3} mb={1} wrap="wrap">
                        <Heading size="md" color={PRIMARY} textTransform="capitalize">
                          {bestOption.mode}
                        </Heading>
                        <Box
                          display="inline-block" px={3} py={0.5} borderRadius="full"
                          bg={GREEN_LIGHT} color="#15803d" fontSize="0.7rem" fontWeight="700"
                          letterSpacing="0.04em" textTransform="uppercase"
                          style={{ transition: `all 0.2s ${SPRING}` }}
                          _hover={{ transform: "scale(1.08)" } as any}
                        >
                          Recommended
                        </Box>
                        <Badge colorPalette={riskPalette(bestOption.risk_level) as any} variant="outline">
                          {bestOption.risk_level} risk
                        </Badge>
                      </Flex>
                      <Text color={MUTED} fontSize="sm">{bestOption.reason}</Text>
                    </Box>
                    <Flex gap={5} textAlign="center">
                      {[
                        { val: `₹${Math.round(bestOption.cost_inr)}`, label: "Cost", color: RED },
                        { val: `${bestOption.time_min} min`, label: "Time", color: PRIMARY },
                        { val: `${bestOption.reliability_score}/10`, label: "Reliability", color: PRIMARY },
                      ].map((stat) => (
                        <Box
                          key={stat.label}
                          style={{ transition: `transform 0.22s ${SPRING}` }}
                          _hover={{ transform: "scale(1.1)" } as any}
                          cursor="default"
                        >
                          <Text fontSize="xl" fontWeight="700" color={stat.color}>{stat.val}</Text>
                          <Text fontSize="xs" color={SUBTLE}>{stat.label}</Text>
                        </Box>
                      ))}
                    </Flex>
                  </Flex>
                ) : (
                  <Text color={MUTED}>No transport options available</Text>
                )}
              </Box>

              {/* ── Detail Grid: Risk + Weather + Reliability ── */}
              <Grid templateColumns={{ base: "1fr", lg: "repeat(3, 1fr)" }} gap={4}>

                {/* Cancellation Risk detail */}
                <Card topColor={RED} glowColor={RED}>
                  <CardLabel>Cancellation Risk — Detail</CardLabel>
                  {predictionQuery.isLoading ? (
                    <Skeleton h="160px" />
                  ) : predictionQuery.data ? (
                    <>
                      <Flex align="center" gap={4} mb={4}>
                        <RiskGauge
                          probability={predictionQuery.data.probability}
                          riskLevel={predictionQuery.data.risk_level}
                        />
                        <Box>
                          <Box
                            display="inline-block" px={3} py={1} borderRadius="full"
                            fontSize="0.7rem" fontWeight="700" letterSpacing="0.05em"
                            textTransform="uppercase" mb={1}
                            bg={riskBg(predictionQuery.data.risk_level)}
                            color={riskColor(predictionQuery.data.risk_level)}
                            style={{ transition: `all 0.2s ${EASE}` }}
                            _hover={{ transform: "scale(1.08)" } as any}
                          >
                            {predictionQuery.data.risk_level.toUpperCase()}
                          </Box>
                          <Text fontSize="xs" color={MUTED}>
                            {predictionQuery.data.using_ml_model ? "XGBoost ML" : "Rule-based"}
                          </Text>
                        </Box>
                      </Flex>
                      <VStack gap={2} align="stretch">
                        {predictionQuery.data.factors.slice(0, 4).map((f, i) => {
                          const isExpanded = expandedFactor === i
                          const accent =
                            f.impact === "negative" ? RED
                              : f.impact === "positive" ? GREEN
                              : GOLD
                          return (
                            <Box
                              key={i}
                              p={2}
                              borderRadius="8px"
                              border={`1px solid ${isExpanded ? accent : BORDER}`}
                              bg={isExpanded ? `${accent}08` : INPUT_BG}
                              cursor="pointer"
                              onClick={() => setExpandedFactor(isExpanded ? null : i)}
                              style={{ transition: `all 0.22s ${EASE}` }}
                              _hover={{
                                border: `1px solid ${accent}`,
                                bg: `${accent}0c`,
                                transform: "translateX(3px)",
                              } as any}
                            >
                              <Flex gap={2} align="center">
                                <Text fontSize="sm" flexShrink={0}>
                                  {f.impact === "positive" ? "✅" : f.impact === "negative" ? "⚠️" : "ℹ️"}
                                </Text>
                                <Text color={PRIMARY} fontSize="xs" fontWeight="600" flex="1">
                                  {f.factor}
                                </Text>
                                <Box color={SUBTLE} style={{ transition: `transform 0.2s ${EASE}` }}>
                                  {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                </Box>
                              </Flex>
                              {isExpanded && (
                                <Text color={MUTED} fontSize="0.68rem" mt={1} pl={6}>
                                  {f.detail}
                                </Text>
                              )}
                            </Box>
                          )
                        })}
                      </VStack>
                    </>
                  ) : null}
                </Card>

                {/* Weather detail */}
                <Card topColor={GOLD} glowColor={GOLD}>
                  <CardLabel>Weather Conditions</CardLabel>
                  {weatherQuery.isLoading ? (
                    <Skeleton h="160px" />
                  ) : weatherQuery.data ? (
                    <>
                      <Flex align="center" gap={3} mb={3}>
                        <Box
                          style={{ transition: `transform 0.3s ${SPRING}` }}
                          _hover={{ transform: "scale(1.3) rotate(-10deg)" } as any}
                          cursor="default"
                        >
                          <WeatherIcon data={weatherQuery.data} />
                        </Box>
                        <Box>
                          <Text fontWeight="700" fontSize="lg" color={PRIMARY}>
                            {weatherQuery.data.conditions}
                          </Text>
                          <Text color={MUTED} fontSize="sm">
                            {weatherQuery.data.temperature_c}°C · {weatherQuery.data.windspeed_kmh} km/h wind
                          </Text>
                        </Box>
                      </Flex>
                      <Box bg={INPUT_BG} borderRadius="md" p={3} mb={3} border={`1px solid ${BORDER}`}>
                        <Text fontSize="xs" color={MUTED} mb={2}>Surge Multipliers</Text>
                        <Flex gap={3} fontSize="sm">
                          {[
                            { icon: "🚗", val: weatherQuery.data.surge_multiplier_cab },
                            { icon: "🛺", val: weatherQuery.data.surge_multiplier_auto },
                            { icon: "🛵", val: weatherQuery.data.surge_multiplier_bike },
                          ].map(({ icon, val }) => (
                            <Box
                              key={icon}
                              style={{ transition: `transform 0.2s ${SPRING}` }}
                              _hover={{ transform: "scale(1.2)" } as any}
                              cursor="default"
                            >
                              <Text color={val > 1 ? GOLD : PRIMARY} fontWeight={val > 1 ? "700" : "400"}>
                                {icon} {val}x
                              </Text>
                            </Box>
                          ))}
                        </Flex>
                      </Box>
                      <Text fontSize="xs" color={MUTED}>{weatherQuery.data.risk_impact}</Text>
                    </>
                  ) : null}
                </Card>

                {/* Route Reliability */}
                <Card topColor={BLUE} glowColor={BLUE}>
                  <CardLabel>Route Reliability</CardLabel>
                  {reliabilityQuery.isLoading ? (
                    <Skeleton h="160px" />
                  ) : reliabilityQuery.data ? (
                    <>
                      <Box
                        style={{ transition: `transform 0.25s ${SPRING}` }}
                        _hover={{ transform: "scale(1.04)" } as any}
                        cursor="default"
                      >
                        <Flex align="end" gap={2} mb={4}>
                          <Text
                            fontSize="4xl" fontWeight="700" lineHeight="1"
                            color={
                              reliabilityQuery.data.score >= 7 ? GREEN
                                : reliabilityQuery.data.score >= 4 ? GOLD : RED
                            }
                          >
                            {reliabilityQuery.data.score}
                          </Text>
                          <Text color={MUTED} mb={1} fontSize="sm">
                            /10 · {reliabilityQuery.data.label}
                          </Text>
                        </Flex>
                      </Box>
                      <VStack gap={3} align="stretch">
                        {[
                          {
                            label: "Cancel Rate",
                            value: `${Math.round(reliabilityQuery.data.cancel_rate * 100)}%`,
                            w: reliabilityQuery.data.cancel_rate * 100,
                            color: RED,
                          },
                          {
                            label: "Avg Wait",
                            value: `${reliabilityQuery.data.avg_wait_min} min`,
                            w: Math.min(reliabilityQuery.data.avg_wait_min * 5, 100),
                            color: GOLD,
                          },
                        ].map((row) => (
                          <Box key={row.label}>
                            <Flex justify="space-between" fontSize="sm" mb={1}>
                              <Text color={MUTED}>{row.label}</Text>
                              <Text fontWeight="600" color={PRIMARY}>{row.value}</Text>
                            </Flex>
                            <Box h="5px" bg={BORDER} borderRadius="full" overflow="hidden">
                              <Box
                                h="100%"
                                bg={row.color}
                                w={`${row.w}%`}
                                borderRadius="full"
                                style={{ transition: "width 1.3s ease" }}
                              />
                            </Box>
                          </Box>
                        ))}
                        <Flex justify="space-between" fontSize="sm">
                          <Text color={MUTED}>Surge Pattern</Text>
                          <Text fontWeight="600" fontSize="xs" color={PRIMARY}>
                            {reliabilityQuery.data.surge_frequency}
                          </Text>
                        </Flex>
                        <Flex gap={2} flexWrap="wrap">
                          {reliabilityQuery.data.recommended_modes.map((m) => (
                            <Box
                              key={m}
                              display="inline-block"
                              px={2} py={0.5} borderRadius="full"
                              bg={RED_LIGHT} color={RED}
                              fontSize="0.7rem" fontWeight="700"
                              textTransform="uppercase" letterSpacing="0.05em"
                              cursor="default"
                              style={{ transition: `all 0.2s ${SPRING}` }}
                              _hover={{ transform: "scale(1.1)", bg: RED, color: "white" } as any}
                            >
                              {m}
                            </Box>
                          ))}
                        </Flex>
                      </VStack>
                    </>
                  ) : null}
                </Card>
              </Grid>

              {/* ── Transport Alternatives (fully interactive) ── */}
              <Box
                bg={CARD}
                borderRadius="14px"
                p={6}
                style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)" }}
              >
                <Flex align="center" justify="space-between" mb={4}>
                  <CardLabel>Transport Alternatives</CardLabel>
                  {selectedIdx !== null && (
                    <Text
                      fontSize="xs" color={RED} cursor="pointer" fontWeight="600"
                      style={{ transition: `opacity 0.2s ${EASE}` }}
                      _hover={{ opacity: 0.7 } as any}
                      onClick={() => setSelectedIdx(null)}
                    >
                      Clear selection ×
                    </Text>
                  )}
                </Flex>
                {alternativesQuery.isLoading ? (
                  <VStack gap={3}>
                    <Skeleton h="64px" />
                    <Skeleton h="64px" />
                    <Skeleton h="64px" />
                  </VStack>
                ) : availableOptions.length > 0 ? (
                  <VStack gap={2} align="stretch">
                    {availableOptions.map((opt, i) => {
                      const isBest = opt === bestOption
                      const isSelected = i === selectedIdx
                      const color = modeColor(opt.mode)
                      return (
                        <Box
                          key={`${opt.mode}-${opt.variant ?? ""}-${i}`}
                          p={3}
                          borderRadius="10px"
                          bg={
                            isSelected ? `${RED}06`
                              : isBest ? `${GREEN}05`
                              : "transparent"
                          }
                          borderLeft={`3px solid ${isSelected ? RED : isBest ? GREEN : "transparent"}`}
                          border={`1px solid ${isSelected ? `${RED}35` : isBest ? `${GREEN}35` : BORDER}`}
                          cursor="pointer"
                          style={{ transition: `all 0.22s ${EASE}` }}
                          _hover={{
                            bg: `${color}06`,
                            borderLeft: `3px solid ${color}`,
                            border: `1px solid ${color}35`,
                            transform: "translateX(4px)",
                          } as any}
                          _active={{ transform: "scale(0.99)" } as any}
                          onClick={() => setSelectedIdx(isSelected ? null : i)}
                        >
                          <Flex align="center" gap={4}>
                            <Box
                              style={{ transition: `transform 0.25s ${SPRING}` }}
                              _hover={{ transform: "scale(1.15) rotate(5deg)" } as any}
                            >
                              <Flex
                                w="44px" h="44px" borderRadius="full"
                                bg={`${color}18`} align="center" justify="center"
                                fontSize="1.3rem" flexShrink={0}
                                border={`1.5px solid ${color}30`}
                              >
                                {modeEmoji(opt.mode, opt.variant)}
                              </Flex>
                            </Box>
                            <Box flex="1">
                              <Flex align="center" gap={2} mb={0.5} flexWrap="wrap">
                                <Text fontWeight="600" color={PRIMARY} textTransform="capitalize" fontSize="sm">
                                  {opt.vehicles_needed > 1 ? `${opt.vehicles_needed} × ` : ""}
                                  {opt.mode}{opt.variant ? ` · ${opt.variant}` : ""}
                                </Text>
                                {isBest && (
                                  <Box
                                    display="inline-block" px={2} py={0.5} borderRadius="full"
                                    bg={GREEN_LIGHT} color="#15803d"
                                    fontSize="0.62rem" fontWeight="700"
                                    textTransform="uppercase" letterSpacing="0.04em"
                                    style={{ transition: `transform 0.2s ${SPRING}` }}
                                    _hover={{ transform: "scale(1.08)" } as any}
                                  >
                                    Best for you
                                  </Box>
                                )}
                                {opt.risk_level === "high" && !isBest && (
                                  <Box
                                    display="inline-block" px={2} py={0.5} borderRadius="full"
                                    bg={RED_LIGHT} color={RED}
                                    fontSize="0.62rem" fontWeight="700" textTransform="uppercase"
                                  >
                                    High Risk
                                  </Box>
                                )}
                              </Flex>
                              <Text fontSize="xs" color={MUTED}>{opt.reason}</Text>

                              {/* Expanded section */}
                              {isSelected && (
                                <Box
                                  mt={3} p={3} borderRadius="8px"
                                  bg={GOLD_LIGHT} border={`1px solid ${GOLD}35`}
                                  style={{ animation: "fadeIn 0.2s ease" }}
                                >
                                  {opt.time_breakdown ? (
                                    <>
                                      <Text fontSize="xs" color={GOLD} fontWeight="700" mb={1}>
                                        {opt.time_breakdown.label}
                                      </Text>
                                      {opt.time_breakdown.frequency_label && (
                                        <Text fontSize="xs" color={MUTED} mb={1}>
                                          {opt.time_breakdown.frequency_label}
                                        </Text>
                                      )}
                                      <Flex gap={4} fontSize="xs" color={MUTED} flexWrap="wrap">
                                        {opt.time_breakdown.walk_min > 0 && (
                                          <Text>🚶 {opt.time_breakdown.walk_min} min walk</Text>
                                        )}
                                        <Text>⏱ {opt.time_breakdown.wait_min} min wait</Text>
                                        <Text>🛣 {opt.time_breakdown.travel_min} min travel</Text>
                                      </Flex>
                                    </>
                                  ) : (
                                    <Text fontSize="xs" color={MUTED}>
                                      {opt.time_min} min total · ₹{Math.round(opt.cost_inr)} · {opt.reliability_score}/10 reliability
                                    </Text>
                                  )}
                                  {opt.stop_details && (
                                    <Box mt={2} fontSize="xs" color={MUTED}>
                                      <Text>🚉 Board: {opt.stop_details.board_at}</Text>
                                      <Text>🚉 Alight: {opt.stop_details.alight_at}</Text>
                                    </Box>
                                  )}
                                </Box>
                              )}
                            </Box>
                            <Flex align="center" gap={2} flexShrink={0}>
                              <Box textAlign="right">
                                <Text fontWeight="700" fontSize="md" color={RED}>
                                  ₹{Math.round(opt.cost_inr)}
                                </Text>
                                <Text fontSize="xs" color={MUTED}>
                                  {opt.time_min} min · {opt.reliability_score}/10
                                </Text>
                              </Box>
                              <Box
                                color={SUBTLE}
                                style={{ transition: `transform 0.2s ${EASE}` }}
                                transform={isSelected ? "rotate(180deg)" : "rotate(0deg)"}
                              >
                                <ChevronDown size={15} />
                              </Box>
                            </Flex>
                          </Flex>
                        </Box>
                      )
                    })}
                  </VStack>
                ) : null}
              </Box>

              {/* ── Cost Breakdown ── */}
              <Card topColor={RED} glowColor={RED}>
                <CardLabel>Cost Breakdown</CardLabel>
                {costQuery.isLoading ? (
                  <Skeleton h="200px" />
                ) : costQuery.data ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={costQuery.data.costs.filter((c) => c.available).map((c) => ({
                        name: c.mode + (c.variant ? ` (${c.variant})` : ""),
                        cost: Math.round(c.final_cost_inr),
                      }))}
                      layout="vertical"
                      margin={{ left: 110, right: 40, top: 5, bottom: 5 }}
                    >
                      <XAxis type="number" tick={{ fill: MUTED, fontSize: 12 }} tickFormatter={(v: number) => `₹${v}`} />
                      <YAxis type="category" dataKey="name" tick={{ fill: MUTED, fontSize: 12 }} width={110} />
                      <Tooltip
                        formatter={(v) => [`₹${v ?? ""}`, "Final Cost"]}
                        cursor={{ fill: "rgba(185,28,28,0.06)" }}
                      />
                      <Bar dataKey="cost" radius={[0, 6, 6, 0]}>
                        {costQuery.data.costs.filter((c) => c.available).map((_, i) => (
                          <Cell key={i} fill={COST_COLORS[i % COST_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : null}
              </Card>

              {/* ── Best Time to Leave ── */}
              <Box
                bg={CARD}
                borderRadius="14px"
                p={6}
                style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)" }}
              >
                <CardLabel>Best Time to Leave</CardLabel>
                {bestTimeQuery.isLoading ? (
                  <Skeleton h="80px" />
                ) : bestTimeQuery.data ? (
                  <>
                    <Flex gap={2} mb={4} wrap="wrap">
                      {bestTimeQuery.data.slots.map((slot, i) => {
                        const bg =
                          slot.color === "green" ? GREEN
                            : slot.color === "yellow" ? GOLD
                            : RED
                        const isSelected = selectedTimeSlot === i
                        return (
                          <Box
                            key={i}
                            flex="1"
                            minW="58px"
                            bg={bg}
                            borderRadius="8px"
                            p={2}
                            textAlign="center"
                            cursor="pointer"
                            outline={isSelected ? `3px solid ${PRIMARY}` : "none"}
                            outlineOffset="2px"
                            style={{ transition: `all 0.22s ${SPRING}` }}
                            _hover={{ transform: "scale(1.08) translateY(-3px)", filter: "brightness(1.1)" } as any}
                            _active={{ transform: "scale(0.96)" } as any}
                            onClick={() => setSelectedTimeSlot(isSelected ? null : i)}
                          >
                            <Text fontSize="xs" color="white" fontWeight="700">{slot.time_label}</Text>
                            <Text fontSize="xs" color="white">{Math.round(slot.cancel_risk * 100)}%</Text>
                          </Box>
                        )
                      })}
                    </Flex>

                    {/* Selected slot detail */}
                    {selectedTimeSlot !== null && bestTimeQuery.data.slots[selectedTimeSlot] && (
                      <Box
                        mb={3} p={3} borderRadius="10px"
                        bg={INPUT_BG} border={`1px solid ${BORDER}`}
                        style={{ animation: "fadeIn 0.2s ease" }}
                      >
                        <Flex align="center" gap={2}>
                          <Zap size={14} color={GOLD} />
                          <Text fontSize="sm" fontWeight="600" color={PRIMARY}>
                            {bestTimeQuery.data.slots[selectedTimeSlot].time_label}
                          </Text>
                          <Text fontSize="sm" color={MUTED}>—</Text>
                          <Text
                            fontSize="sm"
                            fontWeight="600"
                            color={riskColor(bestTimeQuery.data.slots[selectedTimeSlot].risk_level)}
                          >
                            {bestTimeQuery.data.slots[selectedTimeSlot].risk_level} risk
                          </Text>
                          <Text fontSize="xs" color={SUBTLE}>
                            · {Math.round(bestTimeQuery.data.slots[selectedTimeSlot].cancel_risk * 100)}% cancellation rate
                          </Text>
                        </Flex>
                      </Box>
                    )}

                    {bestTimeQuery.data.best_slot && (
                      <Box
                        border={`1px solid ${GREEN}`} borderRadius="10px" p={4} bg={`${GREEN}0d`}
                        style={{ transition: `all 0.2s ${EASE}` }}
                        _hover={{ bg: `${GREEN}15`, transform: "scale(1.01)" } as any}
                      >
                        <Text color={GREEN} fontWeight="500" fontSize="sm">
                          ✅ Best: Leave at {bestTimeQuery.data.best_slot.time_label} —{" "}
                          {bestTimeQuery.data.best_slot.risk_level} risk (
                          {Math.round(bestTimeQuery.data.best_slot.cancel_risk * 100)}% cancellation rate)
                        </Text>
                      </Box>
                    )}
                  </>
                ) : null}
              </Box>

              {/* ── Transit Stops: Metro + Bus ── */}
              {pickupQuery.isLoading ? (
                <Box bg={CARD} borderRadius="14px" p={6}>
                  <CardLabel>Nearby Transit</CardLabel>
                  <Skeleton h="120px" />
                </Box>
              ) : formData ? (
                <Grid templateColumns={{ base: "1fr", lg: "1fr 1fr" }} gap={4}>

                  {/* Metro & MMTS — always shown */}
                  <Box
                    bg={CARD} borderRadius="14px" p={6}
                    borderTop={`3px solid ${metroStops.length > 0 ? TEAL : BORDER}`}
                    style={{
                      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)",
                      transition: `all 0.25s ${SPRING}`,
                    }}
                    _hover={{ transform: "translateY(-3px)", style: { boxShadow: `0 10px 32px ${TEAL}22` } } as any}
                  >
                    <Flex align="center" gap={2} mb={3}>
                      <Train size={13} color={metroStops.length > 0 ? TEAL : MUTED} />
                      <Text fontSize="0.62rem" color={MUTED} fontWeight="700"
                        letterSpacing="1.5px" textTransform="uppercase">
                        Metro &amp; MMTS Stations
                      </Text>
                    </Flex>
                    {metroStops.length > 0 ? (
                      <VStack gap={2} align="stretch">
                        {metroStops.slice(0, 4).map((stop, i) => (
                          <Flex
                            key={i}
                            align="center" gap={3} p={3}
                            bg={INPUT_BG} borderRadius="10px"
                            border={`1px solid ${BORDER}`}
                            cursor="pointer"
                            style={{ transition: `all 0.2s ${EASE}` }}
                            _hover={{
                              bg: "#e6fffa",
                              borderColor: TEAL,
                              transform: "translateX(5px)",
                              boxShadow: `2px 0 0 ${TEAL} inset`,
                            } as any}
                          >
                            <Box style={{ transition: `transform 0.25s ${SPRING}` }}
                              _hover={{ transform: "scale(1.3)" } as any}>
                              <Text fontSize="xl">{stop.stop_type === "mmts" ? "🚂" : "🚇"}</Text>
                            </Box>
                            <Box flex="1">
                              <Text fontWeight="600" color={PRIMARY} fontSize="sm">{stop.name}</Text>
                              <Text fontSize="xs" color={MUTED}>{stop.distance_m}m · {stop.walk_min} min walk</Text>
                            </Box>
                            <Box
                              px={2} py={0.5} borderRadius="full"
                              bg="#e6fffa" color={TEAL} fontSize="0.7rem" fontWeight="700" flexShrink={0}
                              style={{ transition: `all 0.2s ${SPRING}` }}
                              _hover={{ transform: "scale(1.1)", bg: TEAL, color: "white" } as any}
                            >
                              ↓{stop.risk_reduction_pct}% risk
                            </Box>
                          </Flex>
                        ))}
                      </VStack>
                    ) : (
                      <Flex
                        direction="column" align="center" justify="center"
                        py={6} gap={2}
                        bg={INPUT_BG} borderRadius="10px" border={`1px dashed ${BORDER}`}
                      >
                        <Text fontSize="2xl">🚇</Text>
                        <Text fontSize="sm" fontWeight="600" color={MUTED}>No metro nearby</Text>
                        <Text fontSize="xs" color={SUBTLE} textAlign="center">
                          No metro or MMTS station within 1 km of pickup
                        </Text>
                      </Flex>
                    )}
                  </Box>

                  {/* Bus Stops — always shown */}
                  <Box
                    bg={CARD} borderRadius="14px" p={6}
                    borderTop={`3px solid ${busStops.length > 0 ? GOLD : BORDER}`}
                    style={{
                      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)",
                      transition: `all 0.25s ${SPRING}`,
                    }}
                    _hover={{ transform: "translateY(-3px)", style: { boxShadow: `0 10px 32px ${GOLD}22` } } as any}
                  >
                    <Flex align="center" gap={2} mb={3}>
                      <Bus size={13} color={busStops.length > 0 ? GOLD : MUTED} />
                      <Text fontSize="0.62rem" color={MUTED} fontWeight="700"
                        letterSpacing="1.5px" textTransform="uppercase">
                        Bus Stops Nearby
                      </Text>
                    </Flex>
                    {busStops.length > 0 ? (
                      <VStack gap={2} align="stretch">
                        {busStops.map((stop, i) => (
                          <Flex
                            key={i}
                            align="center" gap={3} p={3}
                            bg={INPUT_BG} borderRadius="10px"
                            border={`1px solid ${BORDER}`}
                            cursor="pointer"
                            style={{ transition: `all 0.2s ${EASE}` }}
                            _hover={{
                              bg: GOLD_LIGHT,
                              borderColor: GOLD,
                              transform: "translateX(5px)",
                              boxShadow: `2px 0 0 ${GOLD} inset`,
                            } as any}
                          >
                            <Box style={{ transition: `transform 0.25s ${SPRING}` }}
                              _hover={{ transform: "scale(1.3)" } as any}>
                              <Text fontSize="xl">🚌</Text>
                            </Box>
                            <Box flex="1">
                              <Text fontWeight="600" color={PRIMARY} fontSize="sm">{stop.name}</Text>
                              <Text fontSize="xs" color={MUTED}>{stop.distance_m}m · {stop.walk_min} min walk</Text>
                            </Box>
                            <Box
                              px={2} py={0.5} borderRadius="full"
                              bg={GOLD_LIGHT} color={GOLD} fontSize="0.7rem" fontWeight="700" flexShrink={0}
                              style={{ transition: `all 0.2s ${SPRING}` }}
                              _hover={{ transform: "scale(1.1)", bg: GOLD, color: "white" } as any}
                            >
                              ↓{stop.risk_reduction_pct}% risk
                            </Box>
                          </Flex>
                        ))}
                      </VStack>
                    ) : (
                      <Flex
                        direction="column" align="center" justify="center"
                        py={6} gap={2}
                        bg={INPUT_BG} borderRadius="10px" border={`1px dashed ${BORDER}`}
                      >
                        <Text fontSize="2xl">🚌</Text>
                        <Text fontSize="sm" fontWeight="600" color={MUTED}>No bus stops nearby</Text>
                        <Text fontSize="xs" color={SUBTLE} textAlign="center">
                          No bus stop found within 1 km of pickup
                        </Text>
                      </Flex>
                    )}
                  </Box>
                </Grid>
              ) : null}

            </>
          )}
        </VStack>
      </Container>

      {/* Global keyframe for expanded sections */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </Box>
  )
}
