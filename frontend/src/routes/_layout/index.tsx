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

export const Route = createFileRoute("/_layout/")({
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

function modeEmoji(mode: string, variant?: string | null): string {
  if (variant) {
    return MODE_EMOJI[`${mode}-${variant}`] ?? MODE_EMOJI[mode] ?? "🚌"
  }
  return MODE_EMOJI[mode] ?? "🚌"
}

const COST_COLORS = [
  "#4299e1",
  "#48bb78",
  "#ed8936",
  "#e53e3e",
  "#9f7aea",
  "#38b2ac",
]

function getRiskColorPalette(level: string) {
  if (level === "low") return "green"
  if (level === "moderate") return "yellow"
  return "red"
}

function getRiskBorderColor(level: string) {
  if (level === "low") return "green.500"
  if (level === "moderate") return "yellow.500"
  return "red.500"
}

function WeatherIcon({ data }: { data: WeatherImpactResponse }) {
  if (data.is_raining) return <Text fontSize="3xl">🌧️</Text>
  if (data.temperature_c > 35) return <Text fontSize="3xl">🌡️</Text>
  return <Text fontSize="3xl">☀️</Text>
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
      const jsDay = now.getDay() // 0=Sun
      const dow = jsDay === 0 ? 6 : jsDay - 1 // Mon=0
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
      setGeoError(
        e instanceof Error ? e.message : "Could not geocode locations",
      )
    } finally {
      setIsGeocoding(false)
    }
  }

  // Weather always loads (no form needed)
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

  // Best option = composite score: risk (35%) + cost (35%) + time (30%)
  // Prevents bus always winning just because it's cheapest low-risk
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

  const decisionPalette = bestOption
    ? getRiskColorPalette(bestOption.risk_level)
    : "gray"

  return (
    <Container maxW="full" p={6}>
      <Box mb={6}>
        <Heading size="2xl" mb={2}>
          Intelligence Dashboard
        </Heading>
        <Text color="gray.500">
          Real-time cancellation risk, transport alternatives, and cost
          breakdown for Hyderabad
        </Text>
      </Box>

      <VStack gap={6} align="stretch">
        {/* ── Input Bar ── */}
        <Box
          bg="bg.subtle"
          borderRadius="xl"
          p={6}
          borderWidth="1px"
          position="sticky"
          top={0}
          zIndex={10}
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
                bg="bg"
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
            </Field>
            <Field label="DESTINATION">
              <Input
                placeholder="e.g. Gachibowli"
                value={destText}
                onChange={(e) => setDestText(e.target.value)}
                bg="bg"
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
                bg="bg"
              />
            </Field>
            <Field label="TIME">
              <Input
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                bg="bg"
              />
            </Field>
            <Button
              onClick={handleSubmit}
              loading={isGeocoding}
              size="lg"
              mt={4}
            >
              Analyse My Trip
            </Button>
          </Grid>
          {geoError && (
            <Text color="red.400" mt={2} fontSize="sm">
              {geoError}
            </Text>
          )}
        </Box>

        {!formData ? (
          /* ── Pre-submit prompt ── */
          <Box
            bg="bg.subtle"
            borderRadius="xl"
            p={12}
            borderWidth="1px"
            textAlign="center"
          >
            <Text fontSize="5xl" mb={4}>
              🗺️
            </Text>
            <Heading size="lg" mb={2}>
              Enter your route above to get started
            </Heading>
            <Text color="gray.500">
              Real-time cancellation risk · Transport alternatives · Cost
              breakdown · Best time to leave
            </Text>
          </Box>
        ) : (
          <>
            {/* ── Final Decision Card ── */}
            <Box
              borderWidth="2px"
              borderColor={`${decisionPalette}.500`}
              borderRadius="xl"
              p={6}
            >
              {alternativesQuery.isLoading ? (
                <Skeleton h="80px" />
              ) : bestOption ? (
                <Flex align="center" gap={6} wrap="wrap">
                  <Text fontSize="4xl">
                    {modeEmoji(bestOption.mode, bestOption.variant)}
                  </Text>
                  <Box flex="1" minW="200px">
                    <Flex align="center" gap={3} mb={1} wrap="wrap">
                      <Heading size="lg" textTransform="capitalize">
                        {bestOption.mode}
                      </Heading>
                      <Badge colorPalette={decisionPalette as any}>
                        Recommended
                      </Badge>
                      <Badge
                        colorPalette={
                          getRiskColorPalette(bestOption.risk_level) as any
                        }
                        variant="outline"
                      >
                        {bestOption.risk_level} risk
                      </Badge>
                    </Flex>
                    <Text color="gray.500">{bestOption.reason}</Text>
                  </Box>
                  <Flex gap={6} textAlign="center">
                    <Box>
                      <Text
                        fontSize="xl"
                        fontWeight="bold"
                        color={`${decisionPalette}.500`}
                      >
                        ₹{Math.round(bestOption.cost_inr)}
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        Cost
                      </Text>
                    </Box>
                    <Box>
                      <Text fontSize="xl" fontWeight="bold">
                        {bestOption.time_min} min
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        Time
                      </Text>
                    </Box>
                    <Box>
                      <Text fontSize="xl" fontWeight="bold">
                        {bestOption.reliability_score}/10
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        Reliability
                      </Text>
                    </Box>
                  </Flex>
                </Flex>
              ) : (
                <Text color="gray.500">No transport options available</Text>
              )}
            </Box>

            {/* ── Three-column row ── */}
            <Grid templateColumns={{ base: "1fr", lg: "repeat(3, 1fr)" }} gap={4}>
              {/* Cancellation Risk */}
              <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
                <Text
                  fontSize="xs"
                  color="gray.500"
                  fontWeight="bold"
                  mb={4}
                >
                  CANCELLATION RISK
                </Text>
                {predictionQuery.isLoading ? (
                  <Skeleton h="140px" />
                ) : predictionQuery.data ? (
                  <>
                    <Flex align="center" gap={4} mb={4}>
                      <Box
                        w="80px"
                        h="80px"
                        borderRadius="full"
                        borderWidth="6px"
                        borderColor={getRiskBorderColor(
                          predictionQuery.data.risk_level,
                        )}
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text fontWeight="bold" fontSize="lg">
                          {Math.round(predictionQuery.data.probability * 100)}%
                        </Text>
                      </Box>
                      <Box>
                        <Badge
                          colorPalette={
                            getRiskColorPalette(
                              predictionQuery.data.risk_level,
                            ) as any
                          }
                          mb={1}
                          size="lg"
                        >
                          {predictionQuery.data.risk_level.toUpperCase()}
                        </Badge>
                        <Text fontSize="xs" color="gray.500">
                          {predictionQuery.data.using_ml_model
                            ? "XGBoost ML"
                            : "Rule-based"}
                        </Text>
                      </Box>
                    </Flex>
                    <VStack gap={2} align="stretch">
                      {predictionQuery.data.factors.slice(0, 4).map((f, i) => (
                        <Flex key={i} gap={2} fontSize="sm" align="center">
                          <Text>
                            {f.impact === "positive"
                              ? "✅"
                              : f.impact === "negative"
                                ? "⚠️"
                                : "ℹ️"}
                          </Text>
                          <Text color="gray.400" flex="1" fontSize="xs">
                            {f.factor}
                          </Text>
                        </Flex>
                      ))}
                    </VStack>
                  </>
                ) : null}
              </Box>

              {/* Weather */}
              <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
                <Text
                  fontSize="xs"
                  color="gray.500"
                  fontWeight="bold"
                  mb={4}
                >
                  WEATHER CONDITIONS
                </Text>
                {weatherQuery.isLoading ? (
                  <Skeleton h="140px" />
                ) : weatherQuery.data ? (
                  <>
                    <Flex align="center" gap={3} mb={3}>
                      <WeatherIcon data={weatherQuery.data} />
                      <Box>
                        <Text fontWeight="bold" fontSize="lg">
                          {weatherQuery.data.conditions}
                        </Text>
                        <Text color="gray.500" fontSize="sm">
                          {weatherQuery.data.temperature_c}°C ·{" "}
                          {weatherQuery.data.windspeed_kmh} km/h wind
                        </Text>
                      </Box>
                    </Flex>
                    <Box bg="bg" borderRadius="md" p={3} mb={3}>
                      <Text fontSize="xs" color="gray.500" mb={2}>
                        Surge Multipliers
                      </Text>
                      <Flex gap={3} fontSize="sm">
                        <Text>
                          🚗 {weatherQuery.data.surge_multiplier_cab}x
                        </Text>
                        <Text>
                          🛺 {weatherQuery.data.surge_multiplier_auto}x
                        </Text>
                        <Text>
                          🛵 {weatherQuery.data.surge_multiplier_bike}x
                        </Text>
                      </Flex>
                    </Box>
                    <Text fontSize="xs" color="gray.500">
                      {weatherQuery.data.risk_impact}
                    </Text>
                  </>
                ) : null}
              </Box>

              {/* Route Reliability */}
              <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
                <Text
                  fontSize="xs"
                  color="gray.500"
                  fontWeight="bold"
                  mb={4}
                >
                  ROUTE RELIABILITY
                </Text>
                {reliabilityQuery.isLoading ? (
                  <Skeleton h="140px" />
                ) : reliabilityQuery.data ? (
                  <>
                    <Flex align="end" gap={2} mb={4}>
                      <Text
                        fontSize="5xl"
                        fontWeight="bold"
                        color={
                          reliabilityQuery.data.score >= 7
                            ? "green.500"
                            : reliabilityQuery.data.score >= 4
                              ? "orange.400"
                              : "red.500"
                        }
                      >
                        {reliabilityQuery.data.score}
                      </Text>
                      <Text color="gray.500" mb={2}>
                        /10 · {reliabilityQuery.data.label}
                      </Text>
                    </Flex>
                    <VStack gap={3} align="stretch">
                      {[
                        {
                          label: "Cancel Rate",
                          value: `${Math.round(reliabilityQuery.data.cancel_rate * 100)}%`,
                          w: reliabilityQuery.data.cancel_rate * 100,
                          color: "red.500",
                        },
                        {
                          label: "Avg Wait",
                          value: `${reliabilityQuery.data.avg_wait_min} min`,
                          w: Math.min(
                            reliabilityQuery.data.avg_wait_min * 5,
                            100,
                          ),
                          color: "orange.400",
                        },
                      ].map((row) => (
                        <Box key={row.label}>
                          <Flex justify="space-between" fontSize="sm" mb={1}>
                            <Text color="gray.400">{row.label}</Text>
                            <Text fontWeight="bold">{row.value}</Text>
                          </Flex>
                          <Box
                            h="1.5"
                            bg="bg"
                            borderRadius="full"
                            overflow="hidden"
                          >
                            <Box
                              h="100%"
                              bg={row.color}
                              w={`${row.w}%`}
                              borderRadius="full"
                            />
                          </Box>
                        </Box>
                      ))}
                      <Flex justify="space-between" fontSize="sm">
                        <Text color="gray.400">Surge Pattern</Text>
                        <Text fontWeight="bold" fontSize="xs">
                          {reliabilityQuery.data.surge_frequency}
                        </Text>
                      </Flex>
                      <Flex gap={2} flexWrap="wrap">
                        {reliabilityQuery.data.recommended_modes.map((m) => (
                          <Badge key={m} colorPalette="blue" size="sm">
                            {m}
                          </Badge>
                        ))}
                      </Flex>
                    </VStack>
                  </>
                ) : null}
              </Box>
            </Grid>

            {/* ── Transport Alternatives ── */}
            <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
              <Heading size="sm" color="gray.500" mb={4}>
                TRANSPORT ALTERNATIVES
              </Heading>
              {alternativesQuery.isLoading ? (
                <VStack gap={3}>
                  <Skeleton h="64px" />
                  <Skeleton h="64px" />
                  <Skeleton h="64px" />
                </VStack>
              ) : alternativesQuery.data ? (
                <VStack gap={3} align="stretch">
                  {alternativesQuery.data.options
                    .filter((o) => o.available)
                    .map((opt, i) => {
                      const isBest = opt === bestOption
                      return (
                        <Box
                          key={i}
                          bg="bg"
                          borderWidth={isBest ? "2px" : "1px"}
                          borderColor={isBest ? "green.500" : "border"}
                          borderRadius="lg"
                          p={4}
                        >
                          <Flex align="center" gap={4}>
                            <Text fontSize="2xl">
                              {modeEmoji(opt.mode, opt.variant)}
                            </Text>
                            <Box flex="1">
                              <Flex
                                align="center"
                                gap={2}
                                mb={1}
                                flexWrap="wrap"
                              >
                                <Text fontWeight="bold" textTransform="capitalize">
                                  {opt.vehicles_needed > 1 ? `${opt.vehicles_needed} × ` : ""}
                                  {opt.mode}
                                  {opt.variant ? ` · ${opt.variant}` : ""}
                                </Text>
                                {isBest && (
                                  <Badge colorPalette="green">Best</Badge>
                                )}
                                {opt.vehicles_needed > 1 && (
                                  <Badge colorPalette="orange" size="sm">
                                    {opt.vehicles_needed} vehicles
                                  </Badge>
                                )}
                                <Badge
                                  colorPalette={
                                    getRiskColorPalette(opt.risk_level) as any
                                  }
                                  variant="outline"
                                  size="sm"
                                >
                                  {opt.risk_level}
                                </Badge>
                              </Flex>
                              <Text fontSize="sm" color="gray.500">
                                {opt.reason}
                              </Text>
                            </Box>
                            <Box textAlign="right">
                              <Text fontWeight="bold" fontSize="lg">
                                ₹{Math.round(opt.cost_inr)}
                              </Text>
                              <Text fontSize="sm" color="gray.500">
                                {opt.time_min} min · {opt.reliability_score}/10
                              </Text>
                            </Box>
                          </Flex>
                        </Box>
                      )
                    })}
                </VStack>
              ) : null}
            </Box>

            {/* ── Cost Breakdown ── */}
            <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
              <Heading size="sm" color="gray.500" mb={4}>
                COST BREAKDOWN
              </Heading>
              {costQuery.isLoading ? (
                <Skeleton h="200px" />
              ) : costQuery.data ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={costQuery.data.costs
                      .filter((c) => c.available)
                      .map((c) => ({
                        name:
                          c.mode + (c.variant ? ` (${c.variant})` : ""),
                        cost: Math.round(c.final_cost_inr),
                        base: Math.round(c.base_cost_inr),
                      }))}
                    layout="vertical"
                    margin={{ left: 110, right: 40, top: 5, bottom: 5 }}
                  >
                    <XAxis
                      type="number"
                      tick={{ fill: "#888", fontSize: 12 }}
                      tickFormatter={(v: number) => `₹${v}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fill: "#888", fontSize: 12 }}
                      width={110}
                    />
                    <Tooltip
                      formatter={(v) => [`₹${v ?? ''}`, "Final Cost"]}
                    />
                    <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                      {costQuery.data.costs
                        .filter((c) => c.available)
                        .map((_, i) => (
                          <Cell
                            key={i}
                            fill={COST_COLORS[i % COST_COLORS.length]}
                          />
                        ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : null}
            </Box>

            {/* ── Best Time to Leave ── */}
            <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
              <Heading size="sm" color="gray.500" mb={4}>
                BEST TIME TO LEAVE
              </Heading>
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
                          slot.color === "green"
                            ? "green.500"
                            : slot.color === "yellow"
                              ? "yellow.400"
                              : "red.500"
                        }
                        borderRadius="md"
                        p={2}
                        textAlign="center"
                      >
                        <Text fontSize="xs" color="white" fontWeight="bold">
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
                      borderWidth="1px"
                      borderColor="green.500"
                      borderRadius="lg"
                      p={4}
                    >
                      <Text color="green.400" fontWeight="medium">
                        ✅ Best: Leave at{" "}
                        {bestTimeQuery.data.best_slot.time_label} —{" "}
                        {bestTimeQuery.data.best_slot.risk_level} risk (
                        {Math.round(
                          bestTimeQuery.data.best_slot.cancel_risk * 100,
                        )}
                        % cancellation rate)
                      </Text>
                    </Box>
                  )}
                </>
              ) : null}
            </Box>

            {/* ── Nearest Transit Stops ── */}
            <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
              <Heading size="sm" color="gray.500" mb={4}>
                NEAREST TRANSIT STOPS
              </Heading>
              {pickupQuery.isLoading ? (
                <Skeleton h="120px" />
              ) : pickupQuery.data?.suggestions.length ? (
                <VStack gap={3} align="stretch">
                  {pickupQuery.data.suggestions.slice(0, 5).map((stop, i) => (
                    <Flex
                      key={i}
                      align="center"
                      gap={4}
                      p={3}
                      bg="bg"
                      borderRadius="lg"
                      borderWidth="1px"
                    >
                      <Text fontSize="xl">
                        {stop.stop_type === "metro"
                          ? "🚇"
                          : stop.stop_type === "mmts"
                            ? "🚂"
                            : "🚌"}
                      </Text>
                      <Box flex="1">
                        <Text fontWeight="medium">{stop.name}</Text>
                        <Text fontSize="sm" color="gray.500">
                          {stop.distance_m}m away · {stop.walk_min} min walk
                        </Text>
                      </Box>
                      <Badge colorPalette="green">
                        ↓{stop.risk_reduction_pct}% risk
                      </Badge>
                    </Flex>
                  ))}
                </VStack>
              ) : (
                <Text color="gray.500" fontSize="sm">
                  No transit stops found nearby
                </Text>
              )}
            </Box>
          </>
        )}
      </VStack>
    </Container>
  )
}
