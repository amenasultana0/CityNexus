import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import {
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
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { type WeeklyPlanRequest, getWeeklyPlan } from "@/lib/api"
import { Autocomplete, useJsApiLoader } from "@react-google-maps/api"
import { useRef } from "react"

export const Route = createFileRoute("/_layout/weekly")({
  component: WeeklyPage,
})

const LIBRARIES: ("places")[] = ["places"]

// ── Theme tokens (matches dashboard) ──
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

const MODE_EMOJI: Record<string, string> = {
  metro: "🚇", bus: "🚌", auto: "🛺", cab: "🚗",
  cab_mini: "🚗", cab_sedan: "🚗", cab_suv: "🚙", bike: "🛵",
}

function getModeEmoji(mode: string): string {
  return MODE_EMOJI[mode] ?? "🚌"
}

function getRiskColor(level: string): string {
  if (level === "low") return GREEN
  if (level === "moderate") return AMBER
  return RED
}

function getRiskBg(level: string): string {
   if (level === "low") return "#dcfce7"
  if (level === "moderate") return "#fef3c7"
  return "#fee2e2"
}

function getRiskTextColor(level: string): string {
  if (level === "low") return "#16a34a"
  if (level === "moderate") return "#92400e"
  return "#991b1b"
}

function getWeatherEmoji(code: number, isRaining: boolean): string {
  if (isRaining) return "🌧️"
  if (code === 0) return "☀️"
  if (code <= 3) return "⛅"
  if (code <= 49) return "🌫️"
  if (code <= 67) return "🌧️"
  if (code <= 77) return "❄️"
  if (code <= 82) return "🌦️"
  if (code <= 99) return "⛈️"
  return "☀️"
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

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value)
}

function WeeklyPage() {
  const [pickupText, setPickupText] = useState("")
  const [destText, setDestText] = useState("")
  const [passengers, setPassengers] = useState(1)
  const [departureTime, setDepartureTime] = useState("08:30")
  const [roundTrip, setRoundTrip] = useState(false)
  const [planRequest, setPlanRequest] = useState<WeeklyPlanRequest | null>(null)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [geoError, setGeoError] = useState("")
  const [recentRoutes, setRecentRoutes] = useState<{ pickupText: string; destText: string } | null>(null)

  const pickupRef = useRef<google.maps.places.Autocomplete | null>(null)
  const destRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [destLocation, setDestLocation] = useState<{ lat: number; lng: number } | null>(null)

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  })

  // Load recent route from dashboard localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("tripData")
      if (stored) {
        const data = JSON.parse(stored)
        setRecentRoutes({ pickupText: data.pickupText, destText: data.destText })
      }
    } catch {}
  }, [])

  const applyRecentRoute = () => {
    if (!recentRoutes) return
    setPickupText(recentRoutes.pickupText)
    setDestText(recentRoutes.destText)
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

  const handleSubmit = async () => {
    if (!pickupLocation || !destLocation) {
      setGeoError("Please select locations from the dropdown")
      return
    }
    setIsGeocoding(true)
    setGeoError("")
    try {
      setPlanRequest({
        origin_lat: pickupLocation.lat,
        origin_lon: pickupLocation.lng,
        dest_lat: destLocation.lat,
        dest_lon: destLocation.lng,
        passengers,
        departure_time: departureTime,
        round_trip: roundTrip,
      })
    } finally {
      setIsGeocoding(false)
    }
  }

  const weeklyQuery = useQuery({
    queryKey: ["weekly", planRequest],
    queryFn: () => getWeeklyPlan(planRequest!),
    enabled: !!planRequest,
  })

  const plan = weeklyQuery.data

  const cheapestDay = plan?.weekly_plan.reduce((a, b) => a.cost_inr < b.cost_inr ? a : b)
  const riskiestDay = plan?.weekly_plan.slice().sort((a, b) => {
    const order = { high: 0, moderate: 1, low: 2 }
    return (order[a.risk_level as keyof typeof order] ?? 1) - (order[b.risk_level as keyof typeof order] ?? 1)
  })[0]
  const festiveDays = plan?.weekly_plan.filter((d) => d.is_festival) ?? []
  const avoidCabDays = plan?.weekly_plan.filter((d) => d.is_festival || (d.risk_level === "high" && d.is_raining)) ?? []

  const chartData = plan?.weekly_plan.map((d) => ({
    day: d.day_name.slice(0, 3),
    cost: Math.round(d.cost_inr),
    cab: Math.round(d.cab_cost_inr),
    isCheapest: d === cheapestDay,
  }))

  return (
    <Box bg={PAGE_BG} minH="100vh">
      <Container maxW="full" p={6}>
        <Box mb={6}>
          <Heading size="xl" color={PRIMARY} mb={1} fontWeight="700">Weekly Commute Planner</Heading>
          <Text color={MUTED} fontSize="sm">7-day optimised commute plan with holiday detection, weather forecast and savings breakdown</Text>
        </Box>

        <VStack gap={5} align="stretch">
          {/* ── Input Card ── */}
          <Card>
            {recentRoutes && (
              <Flex align="center" gap={3} mb={4} p={3} bg={INPUT_BG} borderRadius="8px" border={`1px solid ${BORDER}`}>
                <Text fontSize="xs" color={MUTED} flex="1">
                  📍 Recent: <strong>{recentRoutes.pickupText.split(",")[0]}</strong> → <strong>{recentRoutes.destText.split(",")[0]}</strong>
                </Text>
                <Flex align="center" gap={2}>
                  <Text fontSize="2xl">
                    {MODE_EMOJI[plan.cheapest_mode] || "🚌"}
                  </Text>
                  <Text fontWeight="bold" textTransform="capitalize">
                    {plan.cheapest_mode}
                  </Text>
                </Flex>
              </Box>
              <Box bg="bg.subtle" borderRadius="xl" p={4} borderWidth="1px">
                <Text fontSize="xs" color="gray.500" fontWeight="bold" mb={1}>
                  WEEKLY COST
                </Text>
                <Text fontSize="2xl" fontWeight="bold" color="blue.400">
                  {plan.total_estimated_cost_inr
                    ? formatINR(plan.total_estimated_cost_inr)
                    : "-"}
                </Text>
              </Box>
              <Box bg="bg.subtle" borderRadius="xl" p={4} borderWidth="1px">
                <Text fontSize="xs" color="gray.500" fontWeight="bold" mb={1}>
                  CHEAPEST DAY
                </Text>
                <Flex align="center" gap={2}>
                  <Badge colorPalette="green">{cheapestDay?.day_name}</Badge>
                  <Text fontWeight="bold">
                    {cheapestDay ? cheapestDay.cost_display : "-"}
                  </Text>
                </Flex>
              </Box>
              <Box bg="bg.subtle" borderRadius="xl" p={4} borderWidth="1px">
                <Text fontSize="xs" color="gray.500" fontWeight="bold" mb={1}>
                  RISKIEST DAY
                </Text>
                <Flex align="center" gap={2}>
                  <Badge
                    colorPalette={
                      getRiskPalette(riskiestDay?.risk_level || "") as any
                    }
                  >
                    {riskiestDay?.day_name}
                  </Badge>
                  <Text fontSize="sm" textTransform="capitalize">
                    {riskiestDay?.risk_level}
                  </Text>
                </Flex>
              </Box>
            </Grid>

            {/* ── 7-Day Table ── */}
            <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px" overflowX="auto">
              <Heading size="sm" color="gray.500" mb={4}>
                7-DAY PLAN
              </Heading>
              <Box minW="600px">
                {/* Header */}
                <Grid
                  templateColumns="100px 90px 1fr 80px 70px 90px"
                  gap={3}
                  px={4}
                  py={2}
                  fontSize="xs"
                  fontWeight="bold"
                  color="gray.500"
                  borderBottomWidth="1px"
                >
                  Use This Route
                </Box>
              </Flex>
            )}
            <Grid templateColumns={{ base: "1fr", md: "1fr 1fr 80px 120px auto" }} gap={4} alignItems="end">
              <Field label="PICKUP">
                {isLoaded && (
                  <Autocomplete onLoad={(a) => (pickupRef.current = a)} onPlaceChanged={onPickupPlaceChanged}>
                    <Input placeholder="e.g. Ameerpet" value={pickupText} onChange={(e) => setPickupText(e.target.value)} bg={INPUT_BG} borderColor={BORDER} borderRadius="8px" color={PRIMARY} />
                  </Autocomplete>
                )}
              </Field>
              <Field label="DESTINATION">
                {isLoaded && (
                  <Autocomplete onLoad={(a) => (destRef.current = a)} onPlaceChanged={onDestPlaceChanged}>
                    <Input placeholder="e.g. Gachibowli" value={destText} onChange={(e) => setDestText(e.target.value)} bg={INPUT_BG} borderColor={BORDER} borderRadius="8px" color={PRIMARY} />
                  </Autocomplete>
                )}
              </Field>
              <Field label="PAX">
                <Input type="number" min={1} max={6} value={passengers} onChange={(e) => setPassengers(Number(e.target.value))} bg={INPUT_BG} borderColor={BORDER} borderRadius="8px" color={PRIMARY} />
              </Field>
              <Field label="DEPARTURE">
                <Input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} bg={INPUT_BG} borderColor={BORDER} borderRadius="8px" color={PRIMARY} />
              </Field>
              <Button onClick={handleSubmit} loading={isGeocoding} size="lg" mt={4} style={{ background: BLUE, color: "#ffffff", fontWeight: "600", borderRadius: "8px", padding: "12px 24px" }}>
                Plan My Week
              </Button>
            </Grid>
            <Flex align="center" gap={4} mt={3}>
              <Flex align="center" gap={2} cursor="pointer" onClick={() => setRoundTrip(!roundTrip)}>
                <Box w="16px" h="16px" borderRadius="4px" border={`2px solid ${BORDER}`} bg={roundTrip ? BLUE : "white"} display="flex" alignItems="center" justifyContent="center">
                  {roundTrip && <Text color="white" fontSize="10px" lineHeight="1">✓</Text>}
                </Box>
                <Text fontSize="sm" color={MUTED}>Round trip</Text>
              </Flex>
            </Flex>
            {geoError && <Text color={RED} mt={2} fontSize="sm">{geoError}</Text>}
          </Card>

          {/* ── Empty State ── */}
          {!planRequest ? (
            <Card p={14}>
              <Flex direction="column" align="center" textAlign="center">
                <Text fontSize="5rem" mb={4}>📅</Text>
                <Heading size="lg" color={PRIMARY} mb={3} fontWeight="700">Plan Your Week</Heading>
                <Text color={MUTED} maxW="460px" mb={6} lineHeight="1.7" fontSize="sm">
                  Get a 7-day commute plan with weather forecasts, Indian holiday alerts, best transport modes and savings vs always taking a cab
                </Text>
                <Flex gap={3} justify="center" flexWrap="wrap">
                  {[
                    { label: "Holiday Aware", color: AMBER },
                    { label: "Weather Forecast", color: BLUE },
                    { label: "Savings Tracker", color: GREEN },
                  ].map((item) => (
                    <Flex key={item.label} align="center" gap={2} px={4} py={2} borderRadius="full" bg={INPUT_BG} border={`1px solid ${BORDER}`} fontSize="sm" color={MUTED}>
                      <Box w={2} h={2} borderRadius="full" bg={item.color} />
                      <Text>{item.label}</Text>
                    </Flex>
                  ))}
                </Flex>
              </Flex>
            </Card>
          ) : weeklyQuery.isLoading ? (
            <VStack gap={4}>
              <Skeleton h="100px" borderRadius="16px" />
              <Skeleton h="300px" borderRadius="16px" />
              <Skeleton h="200px" borderRadius="16px" />
            </VStack>
          ) : weeklyQuery.isError ? (
            <Card>
              <Flex direction="column" align="center" p={6} textAlign="center">
                <Text color={MUTED} mb={3}>Could not load data — check backend connection</Text>
                <Button size="sm" variant="outline" onClick={() => weeklyQuery.refetch()}>Retry</Button>
              </Flex>
            </Card>
          ) : plan ? (
            <>
              {/* ── Avoid Cab Alert ── */}
              {avoidCabDays.length > 0 && (
                <Box bg="#fff7ed" border={`1px solid ${AMBER}`} borderRadius="12px" p={4}>
                  <Flex align="center" gap={3}>
                    <Text fontSize="xl">⚠️</Text>
                    <Box>
                      <Text fontWeight="700" fontSize="sm" color="#92400e">Avoid cabs on these days</Text>
                      <Text fontSize="xs" color={MUTED}>
                        {avoidCabDays.map((d) => d.day_name).join(", ")} — high cancellation risk or festival surge expected
                      </Text>
                    </Box>
                    <Text textAlign="right" fontWeight="bold">
                      {day.cost_display}
                    </Text>
                    <Text textAlign="right" fontSize="sm" color="gray.500">
                      {day.time_min}m
                    </Text>
                    <Flex justify="center">
                      <Badge
                        colorPalette={getRiskPalette(day.risk_level) as any}
                      >
                        {day.risk_level}
                      </Badge>
                    </Flex>
                  </Grid>
                ))}
              </Box>
            </Box>

              {/* ── Festival Alert ── */}
              {festiveDays.length > 0 && (
                <Box bg="#fdf4ff" border="1px solid #d946ef" borderRadius="12px" p={4}>
                  <Flex align="center" gap={3}>
                    <Text fontSize="xl">🎉</Text>
                    <Box>
                      <Text fontWeight="700" fontSize="sm" color="#86198f">Holidays this week</Text>
                      <Text fontSize="xs" color={MUTED}>
                        {festiveDays.map((d) => `${d.day_name} — ${d.festival_name}`).join(" · ")}
                      </Text>
                    </Box>
                  </Flex>
                </Box>
              )}

              {/* ── Summary Cards ── */}
              <Grid templateColumns={{ base: "1fr 1fr", md: "repeat(4, 1fr)" }} gap={4}>
                <Card topColor={TEAL}>
                  <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>Best Mode</Text>
                  <Flex align="center" gap={2}>
                    <Text fontSize="2xl">{getModeEmoji(plan.cheapest_mode)}</Text>
                    <Text fontWeight="700" textTransform="capitalize" color={PRIMARY}>{plan.cheapest_mode.replace("_", " ")}</Text>
                  </Flex>
                </Card>
                <Card topColor={BLUE}>
                  <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>Weekly Cost</Text>
                  <Text fontSize="1.8rem" fontWeight="700" color={BLUE} lineHeight="1">₹{Math.round(plan.total_estimated_cost_inr)}</Text>
                  <Text fontSize="xs" color={SUBTLE}>vs ₹{Math.round(plan.total_cab_cost_inr)} by cab</Text>
                </Card>
                <Card topColor={GREEN}>
                  <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>You Save</Text>
                  <Text fontSize="1.8rem" fontWeight="700" color={GREEN} lineHeight="1">₹{Math.round(plan.total_savings_inr)}</Text>
                  <Text fontSize="xs" color={SUBTLE}>vs always taking a cab</Text>
                </Card>
                <Card topColor={AMBER}>
                  <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>Cheapest Day</Text>
                  <Flex align="center" gap={2}>
                    <Box px={2} py={0.5} borderRadius="full" bg="#dcfce7" color="#16a34a" fontSize="xs" fontWeight="700">{cheapestDay?.day_name.slice(0, 3)}</Box>
                    <Text fontWeight="700" color={PRIMARY}>₹{cheapestDay ? Math.round(cheapestDay.cost_inr) : "—"}</Text>
                  </Flex>
                  <Text fontSize="xs" color={SUBTLE} mt={1}>Riskiest: {riskiestDay?.day_name.slice(0, 3)}</Text>
                </Card>
              </Grid>

              {/* ── 7-Day Table ── */}
              <Card>
                <CardLabel>7-Day Plan</CardLabel>
                <Box overflowX="auto">
                  <Box minW="700px">
                    {/* Header */}
                    <Grid templateColumns="90px 80px 40px 1fr 75px 60px 80px 80px" gap={3} px={4} py={2} fontSize="0.6rem" fontWeight="700" color={MUTED} letterSpacing="1px" textTransform="uppercase" borderBottom={`1px solid ${BORDER}`}>
                      <Text>Day</Text>
                      <Text>Date</Text>
                      <Text>WX</Text>
                      <Text>Mode & Reason</Text>
                      <Text textAlign="right">Cost</Text>
                      <Text textAlign="right">Time</Text>
                      <Text textAlign="right">Saves</Text>
                      <Text textAlign="center">Risk</Text>
                    </Grid>

                    {plan.weekly_plan.map((day, i) => (
                      <Grid
                        key={i}
                        templateColumns="90px 80px 40px 1fr 75px 60px 80px 80px"
                        gap={3} px={4} py={3} alignItems="center"
                        borderBottom={i < plan.weekly_plan.length - 1 ? `1px solid ${INPUT_BG}` : "none"}
                        bg={day === cheapestDay ? "#f0fdf4" : day.is_festival ? "#fdf4ff" : "transparent"}
                        _hover={{ bg: INPUT_BG }}
                        transition="background 0.15s"
                      >
                        {/* Day */}
                        <Flex align="center" gap={2}>
                          <Text fontSize="lg">{getModeEmoji(day.recommended_mode)}</Text>
                          <Box>
                            <Text fontWeight="600" fontSize="sm" color={PRIMARY}>{day.day_name.slice(0, 3)}</Text>
                            {day.is_festival && (
                              <Text fontSize="0.6rem" color="#86198f" fontWeight="700">🎉 Holiday</Text>
                            )}
                          </Box>
                        </Flex>

                        {/* Date */}
                        <Text fontSize="xs" color={MUTED}>{day.date.slice(5)}</Text>

                        {/* Weather */}
                        <Text fontSize="lg" title={day.weather_desc}>
                          {getWeatherEmoji(day.weather_code, day.is_raining)}
                        </Text>

                        {/* Mode + reason */}
                        <Box>
                          <Text fontSize="sm" fontWeight="600" color={PRIMARY} textTransform="capitalize">
                            {day.recommended_mode.replace("_", " ")}
                            {day.variant ? ` · ${day.variant}` : ""}
                          </Text>
                          <Text fontSize="xs" color={MUTED}>{day.reason}</Text>
                          {day.is_festival && day.festival_name && (
                            <Text fontSize="xs" color="#86198f">{day.festival_name}</Text>
                          )}
                        </Box>

                        {/* Cost */}
                        <Text textAlign="right" fontWeight="700" fontSize="sm" color={day === cheapestDay ? GREEN : PRIMARY}>
                          ₹{Math.round(day.cost_inr)}
                        </Text>

                        {/* Time */}
                        <Text textAlign="right" fontSize="xs" color={MUTED}>{day.time_min}m</Text>

                        {/* Savings */}
                        <Text textAlign="right" fontSize="xs" color={day.savings_vs_cab > 0 ? GREEN : SUBTLE} fontWeight={day.savings_vs_cab > 0 ? "700" : "400"}>
                          {day.savings_vs_cab > 0 ? `+₹${Math.round(day.savings_vs_cab)}` : "—"}
                        </Text>

                        {/* Risk */}
                        <Flex justify="center">
                          <Box px={2} py={0.5} borderRadius="full" bg={getRiskBg(day.risk_level)} color={getRiskTextColor(day.risk_level)} fontSize="0.62rem" fontWeight="700" textTransform="uppercase">
                            {day.risk_level}
                          </Box>
                        </Flex>
                      </Grid>
                    ))}
                  </Box>
                </Box>
              </Card>

              {/* ── Cost vs Cab Chart ── */}
              <Card>
                <CardLabel>Daily Cost vs Cab</CardLabel>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                    <XAxis dataKey="day" tick={{ fill: MUTED, fontSize: 12 }} />
                    <YAxis tick={{ fill: MUTED, fontSize: 12 }} tickFormatter={(v: number) => `₹${v}`} />
                    <Tooltip formatter={(v, name) => [`₹${v}`, name === "cost" ? "Recommended" : "Cab"]} />
                    <Bar dataKey="cab" radius={[4, 4, 0, 0]} fill={`${RED}40`} name="cab" />
                    <Bar dataKey="cost" radius={[4, 4, 0, 0]} name="cost">
                      {chartData?.map((entry, i) => (
                        <Cell key={i} fill={entry.isCheapest ? GREEN : TEAL} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <Text fontSize="xs" color={MUTED} textAlign="center" mt={1}>
                  Green = cheapest day · Red bars = cab cost · Teal bars = recommended mode cost
                </Text>
              </Card>

              {/* ── Weekly Risk + Weather Strip ── */}
              <Card>
                <CardLabel>Risk & Weather Overview</CardLabel>
                <Flex gap={2}>
                  {plan.weekly_plan.map((day, i) => (
                    <Box key={i} flex="1" borderRadius="10px" overflow="hidden" border={`1px solid ${BORDER}`}>
                      <Box bg={getRiskColor(day.risk_level)} p={2} textAlign="center">
                        <Text fontSize="xs" color="white" fontWeight="700">{day.day_name.slice(0, 3)}</Text>
                      </Box>
                      <Box bg={CARD} p={2} textAlign="center">
                        <Text fontSize="lg">{getWeatherEmoji(day.weather_code, day.is_raining)}</Text>
                        <Text fontSize="0.6rem" color={MUTED}>{day.weather_desc}</Text>
                        {day.is_festival && <Text fontSize="0.6rem" color="#86198f">🎉</Text>}
                      </Box>
                    </Box>
                  ))}
                </Flex>
              </Card>
            </>
          ) : null}
        </VStack>
      </Container>
    </Box>
  )
}