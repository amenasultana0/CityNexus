import { useState, useEffect, useRef } from "react"
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
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { type WeeklyPlanRequest, getWeeklyPlan } from "@/lib/api"
import { Autocomplete, useJsApiLoader } from "@react-google-maps/api"

export const Route = createFileRoute("/_layout/weekly")({
  component: WeeklyPage,
})

const LIBRARIES: ("places")[] = ["places"]

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
const PURPLE = "#7c3aed"

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

function formatTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
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
  const [weeklyBudget, setWeeklyBudget] = useState<number | "">("")

  const pickupRef = useRef<google.maps.places.Autocomplete | null>(null)
  const destRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [destLocation, setDestLocation] = useState<{ lat: number; lng: number } | null>(null)

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  })

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

  // ── Derived stats ──
  const festiveDays = plan?.weekly_plan.filter((d) => d.is_festival && d.festival_name) ?? []
  const surgeDays = plan?.weekly_plan.filter((d) => d.is_surge_day) ?? []
  const rainDays = plan?.weekly_plan.filter((d) => d.is_raining) ?? []

  // Worst day = highest risk, then highest surge
  const worstDay = plan?.weekly_plan.slice().sort((a, b) => {
    const order = { high: 0, moderate: 1, low: 2 }
    const rDiff = (order[a.risk_level as keyof typeof order] ?? 1) - (order[b.risk_level as keyof typeof order] ?? 1)
    if (rDiff !== 0) return rDiff
    return b.surge_multiplier - a.surge_multiplier
  })[0]

  // Mode consistency
  const modeCounts: Record<string, number> = {}
  plan?.weekly_plan.forEach((d) => {
    modeCounts[d.recommended_mode] = (modeCounts[d.recommended_mode] ?? 0) + 1
  })
  const dominantMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]

  // Days with departure tip
  const departureTipDays = plan?.weekly_plan.filter((d) => d.best_departure_label) ?? []

  // Budget
  const budgetNum = typeof weeklyBudget === "number" ? weeklyBudget : 0
  const budgetPct = budgetNum > 0 && plan ? Math.min(100, (plan.total_estimated_cost_inr / budgetNum) * 100) : 0
  const overBudget = budgetNum > 0 && plan ? plan.total_estimated_cost_inr > budgetNum : false

  return (
    <Box bg={PAGE_BG} minH="100vh">
      <Container maxW="full" p={6}>
        <Box mb={6}>
          <Heading size="xl" color={PRIMARY} mb={1} fontWeight="700">Weekly Commute Planner</Heading>
          <Text color={MUTED} fontSize="sm">7-day optimised commute plan · holiday detection · weather forecast · surge alerts</Text>
        </Box>

        <VStack gap={5} align="stretch">
          {/* ── Input Card ── */}
          <Card>
            {recentRoutes && (
              <Flex align="center" gap={3} mb={4} p={3} bg={INPUT_BG} borderRadius="8px" border={`1px solid ${BORDER}`}>
                <Text fontSize="xs" color={MUTED} flex="1">
                  📍 Recent: <strong>{recentRoutes.pickupText.split(",")[0]}</strong> → <strong>{recentRoutes.destText.split(",")[0]}</strong>
                </Text>
                <Box px={3} py={1} borderRadius="full" bg={TEAL} color="white" fontSize="xs" fontWeight="700" cursor="pointer" onClick={applyRecentRoute} _hover={{ opacity: 0.85 }}>
                  Use This Route
                </Box>
              </Flex>
            )}
            <Grid templateColumns={{ base: "1fr", md: "1fr 1fr 80px 120px auto" }} gap={4} alignItems="end">
              <Field label="PICKUP">
                {isLoaded && (
                  <Autocomplete
                    onLoad={(a) => (pickupRef.current = a)}
                    onPlaceChanged={onPickupPlaceChanged}
                    options={{
                      componentRestrictions: { country: "in" },
                      bounds: new google.maps.LatLngBounds({ lat: 17.2, lng: 78.2 }, { lat: 17.6, lng: 78.7 }),
                      strictBounds: false,
                    }}
                  >
                    <Input placeholder="e.g. Ameerpet" value={pickupText} onChange={(e) => setPickupText(e.target.value)} bg={INPUT_BG} borderColor={BORDER} borderRadius="8px" color={PRIMARY} />
                  </Autocomplete>
                )}
              </Field>
              <Field label="DESTINATION">
                {isLoaded && (
                  <Autocomplete
                    onLoad={(a) => (destRef.current = a)}
                    onPlaceChanged={onDestPlaceChanged}
                    options={{
                      componentRestrictions: { country: "in" },
                      bounds: new google.maps.LatLngBounds({ lat: 17.2, lng: 78.2 }, { lat: 17.6, lng: 78.7 }),
                      strictBounds: false,
                    }}
                  >
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
            <Flex align="center" gap={6} mt={3} flexWrap="wrap">
              <Flex align="center" gap={2} cursor="pointer" onClick={() => setRoundTrip(!roundTrip)}>
                <Box w="16px" h="16px" borderRadius="4px" border={`2px solid ${BORDER}`} bg={roundTrip ? BLUE : "white"} display="flex" alignItems="center" justifyContent="center">
                  {roundTrip && <Text color="white" fontSize="10px" lineHeight="1">✓</Text>}
                </Box>
                <Text fontSize="sm" color={MUTED}>Round trip</Text>
              </Flex>
              {/* Weekly budget input */}
              <Flex align="center" gap={2}>
                <Text fontSize="sm" color={MUTED}>Weekly budget ₹</Text>
                <Input
                  type="number" min={0} placeholder="e.g. 500"
                  value={weeklyBudget} onChange={(e) => setWeeklyBudget(e.target.value === "" ? "" : Number(e.target.value))}
                  bg={INPUT_BG} borderColor={BORDER} borderRadius="8px" color={PRIMARY}
                  w="110px" h="34px" fontSize="sm"
                />
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
                  Get a 7-day commute plan with weather forecasts, Indian holiday alerts, surge warnings, best departure windows and a weekly budget tracker
                </Text>
                <Flex gap={3} justify="center" flexWrap="wrap">
                  {[
                    { label: "Holiday Aware", color: AMBER },
                    { label: "Surge Alerts", color: RED },
                    { label: "Budget Tracker", color: GREEN },
                    { label: "Departure Tips", color: BLUE },
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
              <Skeleton h="80px" borderRadius="16px" />
              <Skeleton h="320px" borderRadius="16px" />
              <Skeleton h="120px" borderRadius="16px" />
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
              {/* ── Alert Strip ── */}
              {(festiveDays.length > 0 || surgeDays.length > 0 || rainDays.length > 0 || departureTipDays.length > 0) && (
                <VStack gap={2} align="stretch">
                  {festiveDays.length > 0 && (
                    <Box bg="#fdf4ff" border="1px solid #d946ef" borderRadius="12px" p={4}>
                      <Flex align="center" gap={3}>
                        <Text fontSize="xl">🎉</Text>
                        <Box>
                          <Text fontWeight="700" fontSize="sm" color="#86198f">Holidays this week</Text>
                          <Text fontSize="xs" color={MUTED}>{festiveDays.map((d) => `${d.day_name} — ${d.festival_name}`).join(" · ")}</Text>
                        </Box>
                      </Flex>
                    </Box>
                  )}
                  {surgeDays.length > 0 && (
                    <Box bg="#fff7ed" border={`1px solid ${AMBER}`} borderRadius="12px" p={4}>
                      <Flex align="center" gap={3}>
                        <Text fontSize="xl">⚡</Text>
                        <Box>
                          <Text fontWeight="700" fontSize="sm" color="#92400e">Surge pricing expected</Text>
                          <Text fontSize="xs" color={MUTED}>
                            {surgeDays.map((d) => d.day_name).join(", ")} — consider metro or bus on these days
                          </Text>
                        </Box>
                      </Flex>
                    </Box>
                  )}
                  {rainDays.length > 0 && (
                    <Box bg="#eff6ff" border={`1px solid ${BLUE}`} borderRadius="12px" p={4}>
                      <Flex align="center" gap={3}>
                        <Text fontSize="xl">🌧️</Text>
                        <Box>
                          <Text fontWeight="700" fontSize="sm" color="#1e40af">Rain forecast</Text>
                          <Text fontSize="xs" color={MUTED}>
                            {rainDays.map((d) => d.day_name).join(", ")} — fixed-schedule modes recommended
                          </Text>
                        </Box>
                      </Flex>
                    </Box>
                  )}
                  {departureTipDays.length > 0 && (
                    <Box bg="#f0fdf4" border={`1px solid ${GREEN}`} borderRadius="12px" p={4}>
                      <Flex align="center" gap={3}>
                        <Text fontSize="xl">⏰</Text>
                        <Box>
                          <Text fontWeight="700" fontSize="sm" color="#16a34a">Best departure tip</Text>
                          <Text fontSize="xs" color={MUTED}>
                            {departureTipDays[0].best_departure_label}
                            {departureTipDays.length > 1 && ` · applies to ${departureTipDays.map(d => d.day_name.slice(0,3)).join(", ")}`}
                          </Text>
                        </Box>
                      </Flex>
                    </Box>
                  )}
                </VStack>
              )}

              {/* ── Summary Cards ── */}
              <Grid templateColumns={{ base: "1fr 1fr", md: "repeat(4, 1fr)" }} gap={4}>
                {/* Best Mode */}
                <Card topColor={TEAL}>
                  <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>Best Mode</Text>
                  <Flex align="center" gap={2}>
                    <Text fontSize="2xl">{getModeEmoji(plan.cheapest_mode)}</Text>
                    <Text fontWeight="700" textTransform="capitalize" color={PRIMARY}>{plan.cheapest_mode.replace("_", " ")}</Text>
                  </Flex>
                  {dominantMode && (
                    <Text fontSize="xs" color={SUBTLE} mt={1}>{dominantMode[1]}/7 days recommended</Text>
                  )}
                </Card>

                {/* Weekly Cost */}
                <Card topColor={BLUE}>
                  <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>Weekly Cost</Text>
                  <Text fontSize="1.8rem" fontWeight="700" color={BLUE} lineHeight="1">₹{Math.round(plan.total_estimated_cost_inr)}</Text>
                  <Text fontSize="xs" color={SUBTLE} mt={1}>{formatTime(plan.total_time_min)} total commute time</Text>
                </Card>

                {/* Watch Out */}
                <Card topColor={RED}>
                  <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>Watch Out</Text>
                  {worstDay ? (
                    <>
                      <Flex align="center" gap={2}>
                        <Box px={2} py={0.5} borderRadius="full" bg={getRiskBg(worstDay.risk_level)} color={getRiskTextColor(worstDay.risk_level)} fontSize="xs" fontWeight="700">{worstDay.day_name.slice(0, 3)}</Box>
                        <Text fontSize="xs" color={MUTED} textTransform="capitalize">{worstDay.risk_level} risk</Text>
                      </Flex>
                      <Text fontSize="xs" color={SUBTLE} mt={1}>
                        {worstDay.is_raining ? "🌧️ Rain · " : ""}{worstDay.is_surge_day ? "⚡ Surge · " : ""}{worstDay.is_festival ? "🎉 Holiday" : "Plan ahead"}
                      </Text>
                    </>
                  ) : <Text color={MUTED} fontSize="sm">—</Text>}
                </Card>

                {/* Mode Consistency */}
                <Card topColor={PURPLE}>
                  <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>Consistency</Text>
                  {dominantMode ? (
                    <>
                      <Text fontSize="1.4rem" fontWeight="700" color={PURPLE} lineHeight="1">{dominantMode[1]}/7</Text>
                      <Text fontSize="xs" color={SUBTLE} mt={1} textTransform="capitalize">days on {dominantMode[0].replace("_", " ")}</Text>
                    </>
                  ) : <Text color={MUTED} fontSize="sm">—</Text>}
                </Card>
              </Grid>

              {/* ── Weekly Budget Tracker ── */}
              {budgetNum > 0 && (
                <Card topColor={overBudget ? RED : GREEN}>
                  <Flex align="center" justify="space-between" mb={3}>
                    <CardLabel>Weekly Budget</CardLabel>
                    <Text fontSize="sm" fontWeight="700" color={overBudget ? RED : GREEN}>
                      {overBudget ? `₹${Math.round(plan.total_estimated_cost_inr - budgetNum)} over budget` : `₹${Math.round(budgetNum - plan.total_estimated_cost_inr)} remaining`}
                    </Text>
                  </Flex>
                  <Box h="8px" bg={BORDER} borderRadius="full" overflow="hidden" mb={2}>
                    <Box
                      h="100%" borderRadius="full"
                      bg={overBudget ? RED : budgetPct > 80 ? AMBER : GREEN}
                      w={`${budgetPct}%`}
                      style={{ transition: "width 0.6s ease" }}
                    />
                  </Box>
                  <Flex justify="space-between" fontSize="xs" color={MUTED}>
                    <Text>₹0</Text>
                    <Text fontWeight="600" color={PRIMARY}>₹{Math.round(plan.total_estimated_cost_inr)} spent</Text>
                    <Text>₹{budgetNum}</Text>
                  </Flex>
                </Card>
              )}

              {/* ── 7-Day Table ── */}
              <Card>
                <Flex align="center" justify="space-between" mb={3}>
                  <CardLabel>7-Day Plan</CardLabel>
                  <Text fontSize="xs" color={SUBTLE}>{formatTime(plan.total_time_min)} total · {plan.weekly_plan.length} days</Text>
                </Flex>
                <Box overflowX="auto">
                  <Box minW="640px">
                    <Grid templateColumns="80px 70px 36px 1fr 90px 55px 75px" gap={3} px={4} py={2} fontSize="0.6rem" fontWeight="700" color={MUTED} letterSpacing="1px" textTransform="uppercase" borderBottom={`1px solid ${BORDER}`}>
                      <Text>Day</Text>
                      <Text>Date</Text>
                      <Text>WX</Text>
                      <Text>Mode & Reason</Text>
                      <Text textAlign="right">Cost</Text>
                      <Text textAlign="right">Time</Text>
                      <Text textAlign="center">Risk</Text>
                    </Grid>

                    {plan.weekly_plan.map((day, i) => (
                      <Grid
                        key={i}
                        templateColumns="80px 70px 36px 1fr 90px 55px 75px"
                        gap={3} px={4} py={3} alignItems="center"
                        borderBottom={i < plan.weekly_plan.length - 1 ? `1px solid ${INPUT_BG}` : "none"}
                        bg={day === worstDay ? "#fff5f5" : day.is_festival ? "#fdf4ff" : "transparent"}
                        _hover={{ bg: INPUT_BG }}
                        transition="background 0.15s"
                      >
                        {/* Day */}
                        <Flex align="center" gap={1.5}>
                          <Text fontSize="lg">{getModeEmoji(day.recommended_mode)}</Text>
                          <Box>
                            <Flex align="center" gap={1}>
                              <Text fontWeight="600" fontSize="sm" color={PRIMARY}>{day.day_name.slice(0, 3)}</Text>
                              {day.is_surge_day && <Text fontSize="0.6rem" title="Surge day">⚡</Text>}
                            </Flex>
                            {day.is_festival && <Text fontSize="0.55rem" color="#86198f" fontWeight="700">🎉</Text>}
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
                          {day.best_departure_label && (
                            <Text fontSize="xs" color={GREEN} fontWeight="600">⏰ {day.best_departure_label}</Text>
                          )}
                          {day.is_festival && day.festival_name && (
                            <Text fontSize="xs" color="#86198f">{day.festival_name}</Text>
                          )}
                        </Box>

                        {/* Cost */}
                        <Text textAlign="right" fontWeight="700" fontSize="xs" color={PRIMARY}>
                          {day.cost_display}
                        </Text>

                        {/* Time */}
                        <Text textAlign="right" fontSize="xs" color={MUTED}>{day.time_min}m</Text>

                        {/* Risk */}
                        <Flex justify="center">
                          <Box px={2} py={0.5} borderRadius="full" bg={getRiskBg(day.risk_level)} color={getRiskTextColor(day.risk_level)} fontSize="0.6rem" fontWeight="700" textTransform="uppercase">
                            {day.risk_level}
                          </Box>
                        </Flex>
                      </Grid>
                    ))}
                  </Box>
                </Box>
              </Card>

              {/* ── Risk + Weather Strip ── */}
              <Card>
                <CardLabel>Risk & Weather Overview</CardLabel>
                <Flex gap={2}>
                  {plan.weekly_plan.map((day, i) => (
                    <Box key={i} flex="1" borderRadius="10px" overflow="hidden" border={`1px solid ${BORDER}`}>
                      <Box bg={getRiskColor(day.risk_level)} p={2} textAlign="center">
                        <Text fontSize="xs" color="white" fontWeight="700">{day.day_name.slice(0, 3)}</Text>
                        {day.is_surge_day && <Text fontSize="0.55rem" color="white">⚡</Text>}
                      </Box>
                      <Box bg={CARD} p={2} textAlign="center">
                        <Text fontSize="lg">{getWeatherEmoji(day.weather_code, day.is_raining)}</Text>
                        <Text fontSize="0.55rem" color={MUTED}>{day.weather_desc}</Text>
                        {day.is_festival && <Text fontSize="0.55rem" color="#86198f">🎉</Text>}
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