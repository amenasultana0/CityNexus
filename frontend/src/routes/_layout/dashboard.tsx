import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Badge,
  Box,
  Container,
  Flex,
  Grid,
  Heading,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import {
  AlertTriangle,
  Clock,
  Navigation,
  Cloud,
  MapPin,
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

const MODE_EMOJI: Record<string, string> = {
  metro: "🚇",
  bus: "🚌",
  auto: "🛺",
  cab: "🚗",
  "cab-mini": "🚗",
  "cab-sedan": "🚗",
  "cab-suv": "🚙",
  bike: "🛵",
}

const MODE_COLOR: Record<string, string> = {
  metro: "#0694a2",
  auto: "#f97316",
  bus: "#92400e",
  bike: "#7c3aed",
  cab: "#6b7280",
  "cab-mini": "#6b7280",
  "cab-sedan": "#6b7280",
  "cab-suv": "#6b7280",
}

function modeEmoji(mode: string, variant?: string | null): string {
  if (variant) return MODE_EMOJI[`${mode}-${variant}`] ?? MODE_EMOJI[mode] ?? "🚌"
  return MODE_EMOJI[mode] ?? "🚌"
}

function modeColor(mode: string): string {
  return MODE_COLOR[mode] ?? "#6b7280"
}

// Theme tokens
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
  if (level === "low") return GREEN
  if (level === "moderate") return AMBER
  return RED
}
function getRiskTextColor(level: string) {
  if (level === "low") return GREEN
  if (level === "moderate") return AMBER
  return RED
}
function getRiskColorPalette(level: string) {
  if (level === "low") return "green"
  if (level === "moderate") return "yellow"
  return "red"
}

function WeatherIcon({ data }: { data: WeatherImpactResponse }) {
  if (data.is_raining) return <Text fontSize="3xl">🌧️</Text>
  if (data.temperature_c > 35) return <Text fontSize="3xl">🌡️</Text>
  return <Text fontSize="3xl">☀️</Text>
}

/** White card with optional top color border */
function Card({
  children,
  topColor,
  p = 6,
}: {
  children: React.ReactNode
  topColor?: string
  p?: number
}) {
  return (
    <Box
      bg={CARD}
      borderRadius="16px"
      p={p}
      boxShadow={CARD_SHADOW}
      borderTop={topColor ? `4px solid ${topColor}` : undefined}
    >
      {children}
    </Box>
  )
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      fontSize="0.65rem"
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

/** Small icon circle shown at top of stat card */
function IconCircle({
  icon,
  color,
  bg,
}: {
  icon: React.ReactNode
  color: string
  bg: string
}) {
  return (
    <Flex
      w="32px"
      h="32px"
      borderRadius="full"
      bg={bg}
      align="center"
      justify="center"
      mb={3}
      style={{ color }}
    >
      {icon}
    </Flex>
  )
}

function Dashboard() {
  const [pickupText, setPickupText] = useState("")
  const [destText, setDestText] = useState("")
  const [passengers, setPassengers] = useState(1)
  const [timeStr, setTimeStr] = useState("08:00")
  const [formData, setFormData] = useState<FormData | null>(null)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [geoError, setGeoError] = useState("")

  const handleSubmit = async () => {
    if (!pickupText || !destText) return
    setIsGeocoding(true)
    setGeoError("")
    try {
      const [pickup, dest] = await Promise.all([
        geocode(pickupText),
        geocode(destText),
      ])
      const h = parseInt(timeStr.split(":")[0], 10)
      const now = new Date()
      const jsDay = now.getDay()
      const dow = jsDay === 0 ? 6 : jsDay - 1
      setFormData({
        originLat: pickup.lat,
        originLon: pickup.lon,
        destLat: dest.lat,
        destLon: dest.lon,
        passengers,
        hour: h,
        dayOfWeek: dow,
        month: now.getMonth() + 1,
      })
    } catch (e: unknown) {
      setGeoError(e instanceof Error ? e.message : "Could not geocode locations")
    } finally {
      setIsGeocoding(false)
    }
  }

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
        origin_lat: fd.originLat,
        origin_lon: fd.originLon,
        dest_lat: fd.destLat,
        dest_lon: fd.destLon,
        hour: fd.hour,
        day_of_week: fd.dayOfWeek,
        month: fd.month,
      }
      return predictCancellation(payload)
    },
    enabled: !!formData,
  })

  const reliabilityQuery = useQuery({
    queryKey: ["reliability", formData],
    queryFn: () =>
      getRouteReliability({
        origin_lat: formData!.originLat,
        origin_lon: formData!.originLon,
        dest_lat: formData!.destLat,
        dest_lon: formData!.destLon,
        hour: formData!.hour,
        day_of_week: formData!.dayOfWeek,
      }),
    enabled: !!formData,
  })

  const bestTimeQuery = useQuery({
    queryKey: ["bestTime", formData],
    queryFn: () =>
      getBestTime({
        origin_lat: formData!.originLat,
        origin_lon: formData!.originLon,
        dest_lat: formData!.destLat,
        dest_lon: formData!.destLon,
        current_hour: formData!.hour,
        day_of_week: formData!.dayOfWeek,
        lookahead_hours: 6,
      }),
    enabled: !!formData,
  })

  const alternativesQuery = useQuery({
    queryKey: ["alternatives", formData, weatherQuery.data?.is_raining],
    queryFn: () =>
      getAlternatives({
        origin_lat: formData!.originLat,
        origin_lon: formData!.originLon,
        dest_lat: formData!.destLat,
        dest_lon: formData!.destLon,
        passengers: formData!.passengers,
        hour: formData!.hour,
        day_of_week: formData!.dayOfWeek,
        is_raining: weatherQuery.data?.is_raining ?? false,
      }),
    enabled: !!formData,
  })

  const costQuery = useQuery({
    queryKey: ["cost", formData],
    queryFn: () => {
      const now = new Date()
      const dt = new Date(
        now.getFullYear(), now.getMonth(), now.getDate(),
        formData!.hour, 0, 0,
      ).toISOString()
      return getJourneyCost({
        origin_lat: formData!.originLat,
        origin_lon: formData!.originLon,
        dest_lat: formData!.destLat,
        dest_lon: formData!.destLon,
        passengers: formData!.passengers,
        datetime: dt,
      })
    },
    enabled: !!formData,
  })

  const pickupQuery = useQuery({
    queryKey: ["pickup", formData],
    queryFn: () =>
      getOptimalPickup({
        origin_lat: formData!.originLat,
        origin_lon: formData!.originLon,
        radius_m: 1000,
      }),
    enabled: !!formData,
  })

  const bestOption = (() => {
    const available = alternativesQuery.data?.options.filter((o) => o.available)
    if (!available || available.length === 0) return undefined
    const riskOrder: Record<string, number> = { low: 0, moderate: 1, high: 2 }
    const maxCost = Math.max(...available.map((o) => o.cost_inr), 1)
    const maxTime = Math.max(...available.map((o) => o.time_min), 1)
    return available.sort((a, b) => {
      const score = (o: typeof a) => {
        const r = (riskOrder[o.risk_level] ?? 1) / 2
        const c = o.cost_inr / maxCost
        const t = o.time_min / maxTime
        return 0.35 * r + 0.35 * c + 0.30 * t
      }
      return score(a) - score(b)
    })[0]
  })()

  const savings = (() => {
    const available = alternativesQuery.data?.options.filter((o) => o.available)
    if (!available || available.length < 2 || !bestOption) return null
    const maxCost = Math.max(...available.map((o) => o.cost_inr))
    const saved = Math.round(maxCost - bestOption.cost_inr)
    return saved > 0 ? saved : null
  })()

  return (
    <Box bg={PAGE_BG} minH="100vh">
      <Container maxW="full" p={6}>
        <Box mb={6}>
          <Heading size="xl" color={PRIMARY} mb={1} fontWeight="700">
            Intelligence Dashboard
          </Heading>
          <Text color={MUTED} fontSize="sm">
            Real-time cancellation risk, transport alternatives, and cost breakdown · Hyderabad
          </Text>
        </Box>

        <VStack gap={5} align="stretch">

          {/* ── Route Input Card ── */}
          <Card>
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
                  borderColor={BORDER}
                  borderRadius="8px"
                  color={PRIMARY}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
              </Field>
              <Field label="DESTINATION">
                <Input
                  placeholder="e.g. Gachibowli"
                  value={destText}
                  onChange={(e) => setDestText(e.target.value)}
                  bg={INPUT_BG}
                  borderColor={BORDER}
                  borderRadius="8px"
                  color={PRIMARY}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
              </Field>
              <Field label="PAX">
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={passengers}
                  onChange={(e) => setPassengers(Number(e.target.value))}
                  bg={INPUT_BG}
                  borderColor={BORDER}
                  borderRadius="8px"
                  color={PRIMARY}
                />
              </Field>
              <Field label="TIME">
                <Input
                  type="time"
                  value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                  bg={INPUT_BG}
                  borderColor={BORDER}
                  borderRadius="8px"
                  color={PRIMARY}
                />
              </Field>
              <Button
                onClick={handleSubmit}
                loading={isGeocoding}
                size="lg"
                mt={4}
                style={{
                  background: BLUE,
                  color: "#ffffff",
                  fontWeight: "600",
                  borderRadius: "8px",
                  padding: "12px 24px",
                }}
              >
                Analyse My Trip
              </Button>
            </Grid>
            {geoError && (
              <Text color={RED} mt={2} fontSize="sm">{geoError}</Text>
            )}
          </Card>

          {/* ── Empty State ── */}
          {!formData ? (
            <Card p={14}>
              <Flex direction="column" align="center" textAlign="center">
                <Flex
                  w="96px"
                  h="96px"
                  borderRadius="full"
                  bg="#e6fffa"
                  align="center"
                  justify="center"
                  mb={5}
                >
                  <MapPin size={48} color={TEAL} strokeWidth={1.5} />
                </Flex>
                <Heading size="lg" color={PRIMARY} mb={3} fontWeight="700">
                  Analyse Your Route
                </Heading>
                <Text color={MUTED} maxW="460px" mb={6} lineHeight="1.7" fontSize="sm">
                  Enter pickup and destination above to get cancellation risk,
                  transport alternatives, best time to leave and cost comparison
                </Text>
                <Flex gap={3} justify="center" flexWrap="wrap">
                  <Flex
                    align="center"
                    gap={2}
                    px={4}
                    py={2}
                    borderRadius="full"
                    bg={INPUT_BG}
                    border={`1px solid ${BORDER}`}
                    fontSize="sm"
                    color={MUTED}
                  >
                    <Box w={2} h={2} borderRadius="full" bg={BLUE} />
                    <Text>ML Powered</Text>
                  </Flex>
                  <Flex
                    align="center"
                    gap={2}
                    px={4}
                    py={2}
                    borderRadius="full"
                    bg={INPUT_BG}
                    border={`1px solid ${BORDER}`}
                    fontSize="sm"
                    color={MUTED}
                  >
                    <Box w={2} h={2} borderRadius="full" bg={AMBER} />
                    <Text>Weather Aware</Text>
                  </Flex>
                  <Flex
                    align="center"
                    gap={2}
                    px={4}
                    py={2}
                    borderRadius="full"
                    bg={INPUT_BG}
                    border={`1px solid ${BORDER}`}
                    fontSize="sm"
                    color={MUTED}
                  >
                    <Box w={2} h={2} borderRadius="full" bg={TEAL} />
                    <Text>Hyderabad Specific</Text>
                  </Flex>
                </Flex>
              </Flex>
            </Card>
          ) : (
            <>
              {/* ── Four Summary Stat Cards ── */}
              <Grid templateColumns={{ base: "1fr 1fr", lg: "repeat(4, 1fr)" }} gap={4}>
                {/* Cancellation Risk */}
                <Card topColor={RED}>
                  <IconCircle
                    icon={<AlertTriangle size={16} />}
                    color={RED}
                    bg="#fef2f2"
                  />
                  <CardLabel>Cancellation Risk</CardLabel>
                  {predictionQuery.isLoading ? (
                    <Skeleton h="40px" />
                  ) : predictionQuery.data ? (
                    <>
                      <Text
                        fontSize="1.8rem"
                        fontWeight="700"
                        color={getRiskTextColor(predictionQuery.data.risk_level)}
                        lineHeight="1"
                        mb={1}
                      >
                        {predictionQuery.data.risk_level.toUpperCase()}
                      </Text>
                      <Text fontSize="0.78rem" color={SUBTLE}>
                        {Math.round(predictionQuery.data.probability * 100)}% probability
                      </Text>
                    </>
                  ) : (
                    <Text color={MUTED} fontSize="sm">—</Text>
                  )}
                </Card>

                {/* Real Wait Time */}
                <Card topColor={BLUE}>
                  <IconCircle
                    icon={<Clock size={16} />}
                    color={BLUE}
                    bg="#eff6ff"
                  />
                  <CardLabel>Real Wait Time</CardLabel>
                  {reliabilityQuery.isLoading ? (
                    <Skeleton h="40px" />
                  ) : reliabilityQuery.data ? (
                    <>
                      <Text
                        fontSize="1.8rem"
                        fontWeight="700"
                        color={BLUE}
                        lineHeight="1"
                        mb={1}
                      >
                        {reliabilityQuery.data.avg_wait_min} min
                      </Text>
                      <Text fontSize="0.78rem" color={SUBTLE}>
                        avg · {reliabilityQuery.data.label}
                      </Text>
                    </>
                  ) : (
                    <Text color={MUTED} fontSize="sm">—</Text>
                  )}
                </Card>

                {/* Best Mode */}
                <Card topColor={GREEN}>
                  <IconCircle
                    icon={<Navigation size={16} />}
                    color={GREEN}
                    bg="#f0fdf4"
                  />
                  <CardLabel>Best Mode Now</CardLabel>
                  {alternativesQuery.isLoading ? (
                    <Skeleton h="40px" />
                  ) : bestOption ? (
                    <>
                      <Text
                        fontSize="1.8rem"
                        fontWeight="700"
                        color={TEAL}
                        lineHeight="1"
                        mb={1}
                        textTransform="capitalize"
                      >
                        {bestOption.mode}
                      </Text>
                      <Text fontSize="0.78rem" color={GREEN}>
                        {savings != null ? `Saves ₹${savings}` : bestOption.reason.slice(0, 28)}
                      </Text>
                    </>
                  ) : (
                    <Text color={MUTED} fontSize="sm">—</Text>
                  )}
                </Card>

                {/* Weather Impact */}
                <Card topColor={AMBER}>
                  <IconCircle
                    icon={<Cloud size={16} />}
                    color={AMBER}
                    bg="#fffbeb"
                  />
                  <CardLabel>Weather Impact</CardLabel>
                  {weatherQuery.isLoading ? (
                    <Skeleton h="40px" />
                  ) : weatherQuery.data ? (
                    <>
                      <Text
                        fontSize="1.8rem"
                        fontWeight="700"
                        color={AMBER}
                        lineHeight="1"
                        mb={1}
                      >
                        {weatherQuery.data.conditions.split(" ")[0]}
                      </Text>
                      <Text fontSize="0.78rem" color={SUBTLE}>
                        {weatherQuery.data.temperature_c}°C · {weatherQuery.data.windspeed_kmh} km/h
                      </Text>
                    </>
                  ) : (
                    <Text color={MUTED} fontSize="sm">—</Text>
                  )}
                </Card>
              </Grid>

              {/* ── Recommendation Banner ── */}
              <Card>
                {alternativesQuery.isLoading ? (
                  <Skeleton h="80px" />
                ) : bestOption ? (
                  <Flex align="center" gap={5} wrap="wrap">
                    <Flex
                      w="56px"
                      h="56px"
                      borderRadius="full"
                      align="center"
                      justify="center"
                      fontSize="2rem"
                      bg={`${modeColor(bestOption.mode)}15`}
                      flexShrink={0}
                    >
                      {modeEmoji(bestOption.mode, bestOption.variant)}
                    </Flex>
                    <Box flex="1" minW="200px">
                      <Flex align="center" gap={3} mb={1} wrap="wrap">
                        <Heading size="md" color={PRIMARY} textTransform="capitalize">
                          {bestOption.mode}
                        </Heading>
                        <Box
                          display="inline-block"
                          px={3}
                          py={0.5}
                          borderRadius="full"
                          bg="#dcfce7"
                          color="#16a34a"
                          fontSize="0.7rem"
                          fontWeight="700"
                          letterSpacing="0.04em"
                          textTransform="uppercase"
                        >
                          Recommended
                        </Box>
                        <Badge
                          colorPalette={getRiskColorPalette(bestOption.risk_level) as any}
                          variant="outline"
                        >
                          {bestOption.risk_level} risk
                        </Badge>
                      </Flex>
                      <Text color={MUTED} fontSize="sm">{bestOption.reason}</Text>
                    </Box>
                    <Flex gap={5} textAlign="center">
                      <Box>
                        <Text fontSize="xl" fontWeight="700" color={TEAL}>
                          ₹{Math.round(bestOption.cost_inr)}
                        </Text>
                        <Text fontSize="xs" color={SUBTLE}>Cost</Text>
                      </Box>
                      <Box>
                        <Text fontSize="xl" fontWeight="700" color={PRIMARY}>
                          {bestOption.time_min} min
                        </Text>
                        <Text fontSize="xs" color={SUBTLE}>Time</Text>
                      </Box>
                      <Box>
                        <Text fontSize="xl" fontWeight="700" color={PRIMARY}>
                          {bestOption.reliability_score}/10
                        </Text>
                        <Text fontSize="xs" color={SUBTLE}>Reliability</Text>
                      </Box>
                    </Flex>
                  </Flex>
                ) : (
                  <Text color={MUTED}>No transport options available</Text>
                )}
              </Card>

              {/* ── Detail: Cancellation Risk + Weather + Route Reliability ── */}
              <Grid templateColumns={{ base: "1fr", lg: "repeat(3, 1fr)" }} gap={4}>
                {/* Cancellation Risk detail */}
                <Card topColor={RED}>
                  <CardLabel>Cancellation Risk — Detail</CardLabel>
                  {predictionQuery.isLoading ? (
                    <Skeleton h="140px" />
                  ) : predictionQuery.data ? (
                    <>
                      <Flex align="center" gap={4} mb={4}>
                        <Box
                          w="72px"
                          h="72px"
                          borderRadius="full"
                          borderWidth="5px"
                          borderColor={getRiskBorderColor(predictionQuery.data.risk_level)}
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                        >
                          <Text
                            fontWeight="700"
                            fontSize="md"
                            color={getRiskTextColor(predictionQuery.data.risk_level)}
                          >
                            {Math.round(predictionQuery.data.probability * 100)}%
                          </Text>
                        </Box>
                        <Box>
                          <Box
                            display="inline-block"
                            px={3}
                            py={1}
                            borderRadius="full"
                            fontSize="0.7rem"
                            fontWeight="700"
                            letterSpacing="0.05em"
                            textTransform="uppercase"
                            mb={1}
                            bg={
                              predictionQuery.data.risk_level === "low"
                                ? "#dcfce7"
                                : predictionQuery.data.risk_level === "moderate"
                                  ? "#fef3c7"
                                  : "#fee2e2"
                            }
                            color={getRiskTextColor(predictionQuery.data.risk_level)}
                          >
                            {predictionQuery.data.risk_level.toUpperCase()}
                          </Box>
                          <Text fontSize="xs" color={MUTED}>
                            {predictionQuery.data.using_ml_model ? "XGBoost ML" : "Rule-based"}
                          </Text>
                        </Box>
                      </Flex>
                      <VStack gap={2} align="stretch">
                        {predictionQuery.data.factors.slice(0, 4).map((f, i) => (
                          <Flex key={i} gap={2} align="center">
                            <Text fontSize="sm">
                              {f.impact === "positive" ? "✅" : f.impact === "negative" ? "⚠️" : "ℹ️"}
                            </Text>
                            <Text color={MUTED} flex="1" fontSize="xs">{f.factor}</Text>
                          </Flex>
                        ))}
                      </VStack>
                    </>
                  ) : null}
                </Card>

                {/* Weather detail */}
                <Card topColor={AMBER}>
                  <CardLabel>Weather Conditions</CardLabel>
                  {weatherQuery.isLoading ? (
                    <Skeleton h="140px" />
                  ) : weatherQuery.data ? (
                    <>
                      <Flex align="center" gap={3} mb={3}>
                        <WeatherIcon data={weatherQuery.data} />
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
                          <Text color={weatherQuery.data.surge_multiplier_cab > 1 ? AMBER : PRIMARY}>
                            🚗 {weatherQuery.data.surge_multiplier_cab}x
                          </Text>
                          <Text color={weatherQuery.data.surge_multiplier_auto > 1 ? AMBER : PRIMARY}>
                            🛺 {weatherQuery.data.surge_multiplier_auto}x
                          </Text>
                          <Text color={weatherQuery.data.surge_multiplier_bike > 1 ? AMBER : PRIMARY}>
                            🛵 {weatherQuery.data.surge_multiplier_bike}x
                          </Text>
                        </Flex>
                      </Box>
                      <Text fontSize="xs" color={MUTED}>{weatherQuery.data.risk_impact}</Text>
                    </>
                  ) : null}
                </Card>

                {/* Route Reliability detail */}
                <Card topColor={BLUE}>
                  <CardLabel>Route Reliability</CardLabel>
                  {reliabilityQuery.isLoading ? (
                    <Skeleton h="140px" />
                  ) : reliabilityQuery.data ? (
                    <>
                      <Flex align="end" gap={2} mb={4}>
                        <Text
                          fontSize="4xl"
                          fontWeight="700"
                          color={
                            reliabilityQuery.data.score >= 7 ? GREEN
                              : reliabilityQuery.data.score >= 4 ? AMBER
                              : RED
                          }
                          lineHeight="1"
                        >
                          {reliabilityQuery.data.score}
                        </Text>
                        <Text color={MUTED} mb={1} fontSize="sm">
                          /10 · {reliabilityQuery.data.label}
                        </Text>
                      </Flex>
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
                            color: AMBER,
                          },
                        ].map((row) => (
                          <Box key={row.label}>
                            <Flex justify="space-between" fontSize="sm" mb={1}>
                              <Text color={MUTED}>{row.label}</Text>
                              <Text fontWeight="600" color={PRIMARY}>{row.value}</Text>
                            </Flex>
                            <Box h="4px" bg={BORDER} borderRadius="full" overflow="hidden">
                              <Box h="100%" bg={row.color} w={`${row.w}%`} borderRadius="full" />
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
                              px={2}
                              py={0.5}
                              borderRadius="full"
                              bg="#e6fffa"
                              color={TEAL}
                              fontSize="0.7rem"
                              fontWeight="700"
                              textTransform="uppercase"
                              letterSpacing="0.05em"
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

              {/* ── Transport Alternatives ── */}
              <Card>
                <CardLabel>Transport Alternatives</CardLabel>
                {alternativesQuery.isLoading ? (
                  <VStack gap={3}>
                    <Skeleton h="64px" />
                    <Skeleton h="64px" />
                    <Skeleton h="64px" />
                  </VStack>
                ) : alternativesQuery.data ? (
                  <VStack gap={0} align="stretch">
                    {alternativesQuery.data.options
                      .filter((o) => o.available)
                      .map((opt, i, arr) => {
                        const isBest = opt === bestOption
                        const isHighRisk = opt.risk_level === "high"
                        const color = modeColor(opt.mode)
                        const isLast = i === arr.length - 1
                        return (
                          <Box
                            key={i}
                            px={3}
                            py={3}
                            borderBottom={isLast ? "none" : `1px solid ${INPUT_BG}`}
                            borderRadius={isBest ? "10px" : "0"}
                            bg={isBest ? "#f0fdf4" : "transparent"}
                            _hover={{ bg: INPUT_BG }}
                            transition="background 0.15s ease"
                          >
                            <Flex align="center" gap={4}>
                              {/* Colored mode circle */}
                              <Flex
                                w="44px"
                                h="44px"
                                borderRadius="full"
                                bg={`${color}18`}
                                align="center"
                                justify="center"
                                fontSize="1.3rem"
                                flexShrink={0}
                                border={`1.5px solid ${color}30`}
                              >
                                {modeEmoji(opt.mode, opt.variant)}
                              </Flex>
                              {/* Name + badges */}
                              <Box flex="1">
                                <Flex align="center" gap={2} mb={0.5} flexWrap="wrap">
                                  <Text fontWeight="600" color={PRIMARY} textTransform="capitalize" fontSize="sm">
                                    {opt.vehicles_needed > 1 ? `${opt.vehicles_needed} × ` : ""}
                                    {opt.mode}
                                    {opt.variant ? ` · ${opt.variant}` : ""}
                                  </Text>
                                  {isBest && (
                                    <Box
                                      display="inline-block"
                                      px={2}
                                      py={0.5}
                                      borderRadius="full"
                                      bg="#dcfce7"
                                      color="#16a34a"
                                      fontSize="0.62rem"
                                      fontWeight="700"
                                      textTransform="uppercase"
                                      letterSpacing="0.04em"
                                    >
                                      Recommended
                                    </Box>
                                  )}
                                  {isHighRisk && !isBest && (
                                    <Box
                                      display="inline-block"
                                      px={2}
                                      py={0.5}
                                      borderRadius="full"
                                      bg="#fee2e2"
                                      color={RED}
                                      fontSize="0.62rem"
                                      fontWeight="700"
                                      textTransform="uppercase"
                                      letterSpacing="0.04em"
                                    >
                                      High Risk
                                    </Box>
                                  )}
                                  {opt.vehicles_needed > 1 && (
                                    <Badge colorPalette="orange" size="sm">
                                      {opt.vehicles_needed} vehicles
                                    </Badge>
                                  )}
                                </Flex>
                                <Text fontSize="xs" color={MUTED}>{opt.reason}</Text>
                              </Box>
                              {/* Price + time */}
                              <Box textAlign="right" flexShrink={0}>
                                <Text fontWeight="700" fontSize="md" color={PRIMARY}>
                                  ₹{Math.round(opt.cost_inr)}
                                </Text>
                                <Text fontSize="xs" color={MUTED}>
                                  {opt.time_min} min · {opt.reliability_score}/10
                                </Text>
                              </Box>
                            </Flex>
                          </Box>
                        )
                      })}
                  </VStack>
                ) : null}
              </Card>

              {/* ── Cost Breakdown ── */}
              <Card>
                <CardLabel>Cost Breakdown</CardLabel>
                {costQuery.isLoading ? (
                  <Skeleton h="200px" />
                ) : costQuery.data ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={costQuery.data.costs
                        .filter((c) => c.available)
                        .map((c) => ({
                          name: c.mode + (c.variant ? ` (${c.variant})` : ""),
                          cost: Math.round(c.final_cost_inr),
                        }))}
                      layout="vertical"
                      margin={{ left: 110, right: 40, top: 5, bottom: 5 }}
                    >
                      <XAxis
                        type="number"
                        tick={{ fill: MUTED, fontSize: 12 }}
                        tickFormatter={(v: number) => `₹${v}`}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fill: MUTED, fontSize: 12 }}
                        width={110}
                      />
                      <Tooltip formatter={(v) => [`₹${v ?? ""}`, "Final Cost"]} />
                      <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                        {costQuery.data.costs
                          .filter((c) => c.available)
                          .map((_, i) => (
                            <Cell key={i} fill={COST_COLORS[i % COST_COLORS.length]} />
                          ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : null}
              </Card>

              {/* ── Best Time to Leave ── */}
              <Card>
                <CardLabel>Best Time to Leave</CardLabel>
                {bestTimeQuery.isLoading ? (
                  <Skeleton h="80px" />
                ) : bestTimeQuery.data ? (
                  <>
                    <Flex gap={2} mb={4} wrap="wrap">
                      {bestTimeQuery.data.slots.map((slot, i) => (
                        <Box
                          key={i}
                          flex="1"
                          minW="60px"
                          bg={
                            slot.color === "green" ? GREEN
                              : slot.color === "yellow" ? AMBER
                              : RED
                          }
                          borderRadius="8px"
                          p={2}
                          textAlign="center"
                        >
                          <Text fontSize="xs" color="white" fontWeight="700">
                            {slot.time_label}
                          </Text>
                          <Text fontSize="xs" color="white">
                            {Math.round(slot.cancel_risk * 100)}%
                          </Text>
                        </Box>
                      ))}
                    </Flex>
                    {bestTimeQuery.data.best_slot && (
                      <Box
                        border={`1px solid ${GREEN}`}
                        borderRadius="10px"
                        p={4}
                        bg={`${GREEN}0d`}
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
              </Card>

              {/* ── Nearest Transit Stops ── */}
              <Card>
                <CardLabel>Nearest Transit Stops</CardLabel>
                {pickupQuery.isLoading ? (
                  <Skeleton h="120px" />
                ) : pickupQuery.data?.suggestions.length ? (
                  <VStack gap={2} align="stretch">
                    {pickupQuery.data.suggestions.slice(0, 5).map((stop, i) => (
                      <Flex
                        key={i}
                        align="center"
                        gap={4}
                        p={3}
                        bg={INPUT_BG}
                        borderRadius="10px"
                        border={`1px solid ${BORDER}`}
                        _hover={{ bg: BORDER }}
                        transition="background 0.15s"
                      >
                        <Text fontSize="xl">
                          {stop.stop_type === "metro" ? "🚇" : stop.stop_type === "mmts" ? "🚂" : "🚌"}
                        </Text>
                        <Box flex="1">
                          <Text fontWeight="600" color={PRIMARY} fontSize="sm">{stop.name}</Text>
                          <Text fontSize="xs" color={MUTED}>
                            {stop.distance_m}m away · {stop.walk_min} min walk
                          </Text>
                        </Box>
                        <Box
                          display="inline-block"
                          px={2}
                          py={0.5}
                          borderRadius="full"
                          bg="#e6fffa"
                          color={TEAL}
                          fontSize="0.7rem"
                          fontWeight="700"
                        >
                          ↓{stop.risk_reduction_pct}% risk
                        </Box>
                      </Flex>
                    ))}
                  </VStack>
                ) : (
                  <Text color={MUTED} fontSize="sm">No transit stops found nearby</Text>
                )}
              </Card>
            </>
          )}
        </VStack>
      </Container>
    </Box>
  )
}
