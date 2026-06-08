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

const PAGE_BG  = "#f0f4f8"
const CARD     = "#ffffff"
const BORDER   = "#e2e8f0"
const PRIMARY  = "#1a202c"
const MUTED    = "#718096"
const INPUT_BG = "#f7fafc"
const BLUE     = "#1a56db"
const TEAL     = "#0694a2"
const GREEN    = "#10b981"
const AMBER    = "#f59e0b"
const RED      = "#ef4444"
const PURPLE   = "#7c3aed"

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

  const festiveDays = plan?.weekly_plan.filter((d) => d.is_festival && d.festival_name) ?? []
  const surgeDays = plan?.weekly_plan.filter((d) => d.is_surge_day) ?? []
  const rainDays = plan?.weekly_plan.filter((d) => d.is_raining) ?? []
  const worstDay = plan?.weekly_plan.slice().sort((a, b) => {
    const order = { high: 0, moderate: 1, low: 2 }
    const rDiff = (order[a.risk_level as keyof typeof order] ?? 1) - (order[b.risk_level as keyof typeof order] ?? 1)
    if (rDiff !== 0) return rDiff
    return b.surge_multiplier - a.surge_multiplier
  })[0]
  const modeCounts: Record<string, number> = {}
  plan?.weekly_plan.forEach((d) => { modeCounts[d.recommended_mode] = (modeCounts[d.recommended_mode] ?? 0) + 1 })
  const dominantMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]
  const departureTipDays = plan?.weekly_plan.filter((d) => d.best_departure_label) ?? []
  const budgetNum = typeof weeklyBudget === "number" ? weeklyBudget : 0
  const budgetPct = budgetNum > 0 && plan ? Math.min(100, (plan.total_estimated_cost_inr / budgetNum) * 100) : 0
  const overBudget = budgetNum > 0 && plan ? plan.total_estimated_cost_inr > budgetNum : false

  return (
    <Box bg={PAGE_BG} minH="100vh">
      <style>{`
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes orbFloat {
          0%,100% { transform: translateY(0) scale(1); }
          50%     { transform: translateY(-18px) scale(1.06); }
        }
        @keyframes pulseRing {
          0%   { box-shadow: 0 0 0 0   rgba(16,185,129,0.7); }
          70%  { box-shadow: 0 0 0 10px rgba(16,185,129,0); }
          100% { box-shadow: 0 0 0 0   rgba(16,185,129,0); }
        }
        @keyframes floatIn {
          from { opacity: 0; transform: translateX(-18px) scale(0.96); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes shimmerSlide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .hero-stat-glass {
          transition: transform 0.28s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.28s ease;
        }
        .hero-stat-glass:hover {
          transform: translateY(-4px) scale(1.02);
          box-shadow: 0 16px 48px rgba(0,0,0,0.25) !important;
        }
        .day-row {
          transition: background 0.18s ease, transform 0.18s ease;
        }
        .day-row:hover {
          background: rgba(255,255,255,0.85) !important;
          transform: translateX(4px);
        }
        .plan-btn {
          position: relative; overflow: hidden;
          transition: all 0.28s cubic-bezier(0.34,1.56,0.64,1);
        }
        .plan-btn::before {
          content:''; position:absolute; top:0; left:-100%; width:100%; height:100%;
          background: linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent);
          transition: left 0.5s ease;
        }
        .plan-btn:hover::before { left:100%; }
        .plan-btn:hover { transform: translateY(-3px) scale(1.03); }
      `}</style>

      {/* ══ HERO HEADER ══ */}
      <Box
        position="relative" overflow="hidden"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 30%, #064e3b 65%, #0c4a6e 100%)",
          backgroundSize: "300% 300%",
          animation: "gradientShift 10s ease infinite",
        }}
        px={6} pt={10} pb={10}
      >
        {/* Grid texture */}
        <Box position="absolute" inset="0" pointerEvents="none" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px)",
          backgroundSize: "50px 50px",
        }} />

        {/* Orbs */}
        <Box position="absolute" top="-40%" left="8%" w="400px" h="400px" borderRadius="full" pointerEvents="none"
          style={{ background: "radial-gradient(circle,rgba(16,185,129,0.2) 0%,transparent 70%)", animation: "orbFloat 7s ease-in-out infinite" }} />
        <Box position="absolute" bottom="-30%" right="4%" w="320px" h="320px" borderRadius="full" pointerEvents="none"
          style={{ background: "radial-gradient(circle,rgba(26,86,219,0.2) 0%,transparent 70%)", animation: "orbFloat 9s ease-in-out infinite 2s" }} />
        <Box position="absolute" top="20%" right="22%" w="200px" h="200px" borderRadius="full" pointerEvents="none"
          style={{ background: "radial-gradient(circle,rgba(245,158,11,0.14) 0%,transparent 70%)", animation: "orbFloat 6s ease-in-out infinite 1s" }} />

        <Container maxW="full" position="relative" zIndex={1}>
          <Flex align="flex-start" justify="space-between" mb={8} flexWrap="wrap" gap={5}>
            <Box style={{ animation: "slideUpFade 0.5s both" }}>
              <Flex align="center" gap={2} mb={3}>
                <Box w="9px" h="9px" borderRadius="full" bg="#10b981"
                  style={{ animation: "pulseRing 2s ease-in-out infinite" }} />
                <Text fontSize="0.62rem" color="rgba(255,255,255,0.55)" fontWeight="700" letterSpacing="2.5px" textTransform="uppercase">
                  Weekly Planner · Hyderabad
                </Text>
              </Flex>
              <Heading
                fontWeight="900" lineHeight="1.0" mb={3}
                fontSize={{ base: "2.8rem", md: "4rem" }}
                style={{
                  background: "linear-gradient(135deg,#ffffff 0%,#6ee7b7 35%,#93c5fd 65%,#fde68a 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  backgroundSize: "200% 200%",
                  animation: "gradientShift 6s ease infinite",
                }}
              >
                Weekly<br />Commute
              </Heading>
              <Text color="rgba(255,255,255,0.5)" fontSize="md" maxW="420px" lineHeight="1.65">
                7-day optimised plan with holiday detection, weather forecast, surge alerts and budget tracking.
              </Text>
            </Box>

            {/* Plan button */}
            <Box style={{ animation: "slideUpFade 0.5s 0.15s both" }} display="flex" flexDirection="column" gap={3} alignItems="flex-end">
              <button
                className="plan-btn"
                onClick={handleSubmit}
                disabled={isGeocoding}
                style={{
                  padding: "15px 30px",
                  borderRadius: "18px",
                  border: "none",
                  fontWeight: "800",
                  fontSize: "15px",
                  cursor: isGeocoding ? "not-allowed" : "pointer",
                  background: isGeocoding ? "#94a3b8" : "linear-gradient(135deg,#1a56db 0%,#7c3aed 100%)",
                  color: "#fff",
                  boxShadow: "0 8px 36px rgba(26,86,219,0.55), 0 2px 8px rgba(0,0,0,0.3)",
                  letterSpacing: "0.01em",
                }}
              >
                {isGeocoding ? "Planning…" : "📅 Plan My Week"}
              </button>
              {/* Feature pills */}
              <Flex gap={2} flexWrap="wrap" justifyContent="flex-end">
                {[
                  { label: "Holiday Aware", color: "#fde68a" },
                  { label: "Surge Alerts", color: "#fca5a5" },
                  { label: "Budget Tracker", color: "#6ee7b7" },
                ].map((f) => (
                  <Box key={f.label} px={3} py={1} borderRadius="full" fontSize="0.65rem" fontWeight="700"
                    style={{ background: "rgba(255,255,255,0.1)", color: f.color, border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}>
                    {f.label}
                  </Box>
                ))}
              </Flex>
            </Box>
          </Flex>

          {/* ── Glassmorphism stat cards (only when plan loaded) ── */}
          {plan && (
            <Grid templateColumns={{ base: "1fr 1fr", md: "repeat(4,1fr)" }} gap={4}>
              {[
                {
                  label: "Best Mode",
                  value: getModeEmoji(plan.cheapest_mode),
                  unit: plan.cheapest_mode.replace("_", " "),
                  accent: TEAL,
                  delay: "0s",
                },
                {
                  label: "Weekly Cost",
                  value: `₹${Math.round(plan.total_estimated_cost_inr)}`,
                  unit: formatTime(plan.total_time_min) + " total commute",
                  accent: "#93c5fd",
                  delay: "0.08s",
                },
                {
                  label: "Watch Out",
                  value: worstDay?.day_name.slice(0, 3) ?? "—",
                  unit: worstDay ? `${worstDay.risk_level} risk${worstDay.is_raining ? " · 🌧️" : ""}${worstDay.is_surge_day ? " · ⚡" : ""}` : "",
                  accent: "#fca5a5",
                  delay: "0.16s",
                },
                {
                  label: "Consistency",
                  value: dominantMode ? `${dominantMode[1]}/7` : "—",
                  unit: dominantMode ? `days on ${dominantMode[0].replace("_", " ")}` : "",
                  accent: "#c4b5fd",
                  delay: "0.24s",
                },
              ].map((stat, i) => (
                <Box
                  key={i}
                  className="hero-stat-glass"
                  style={{
                    background: "rgba(255,255,255,0.07)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    border: "1px solid rgba(255,255,255,0.13)",
                    borderRadius: "22px",
                    padding: "22px 20px",
                    animation: `slideUpFade 0.55s ${stat.delay} both`,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                  }}
                >
                  <Text fontSize="0.58rem" color="rgba(255,255,255,0.45)" fontWeight="800" letterSpacing="2px" textTransform="uppercase" mb={3}>
                    {stat.label}
                  </Text>
                  <Text fontWeight="900" lineHeight="1" mb={1} fontSize="2.2rem" style={{ color: stat.accent }}>
                    {stat.value}
                  </Text>
                  <Text fontSize="0.7rem" color="rgba(255,255,255,0.38)" fontWeight="600" textTransform="capitalize">{stat.unit}</Text>
                </Box>
              ))}
            </Grid>
          )}
        </Container>
      </Box>

      {/* ══ MAIN BODY ══ */}
      <Container maxW="full" px={6} py={7}>
        <VStack gap={7} align="stretch">

          {/* ── Input Form ── */}
          <Box
            style={{
              animation: "slideUpFade 0.5s 0.1s both",
              background: "rgba(255,255,255,0.95)",
              border: "1px solid rgba(226,232,240,0.7)",
              borderRadius: "28px",
              padding: "28px 24px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.07)",
            }}
          >
            {recentRoutes && (
              <Flex align="center" gap={3} mb={5} p={3} bg={INPUT_BG} borderRadius="12px" border={`1px solid ${BORDER}`}>
                <Text fontSize="xs" color={MUTED} flex="1">
                  📍 Recent: <strong>{recentRoutes.pickupText.split(",")[0]}</strong> → <strong>{recentRoutes.destText.split(",")[0]}</strong>
                </Text>
                <Box px={3} py={1} borderRadius="full" bg={TEAL} color="white" fontSize="xs" fontWeight="700"
                  cursor="pointer" onClick={applyRecentRoute} style={{ transition: "opacity 0.2s" }}>
                  Use This Route
                </Box>
              </Flex>
            )}

            <Grid templateColumns={{ base: "1fr", md: "1fr 1fr 80px 120px" }} gap={4} mb={4}>
              <Field label="PICKUP">
                {isLoaded && (
                  <Autocomplete onLoad={(a) => (pickupRef.current = a)} onPlaceChanged={onPickupPlaceChanged}
                    options={{ componentRestrictions: { country: "in" }, bounds: new google.maps.LatLngBounds({ lat: 17.2, lng: 78.2 }, { lat: 17.6, lng: 78.7 }), strictBounds: false }}>
                    <Input placeholder="e.g. Ameerpet" value={pickupText} onChange={(e) => setPickupText(e.target.value)} bg={INPUT_BG} borderColor={BORDER} borderRadius="10px" color={PRIMARY} />
                  </Autocomplete>
                )}
              </Field>
              <Field label="DESTINATION">
                {isLoaded && (
                  <Autocomplete onLoad={(a) => (destRef.current = a)} onPlaceChanged={onDestPlaceChanged}
                    options={{ componentRestrictions: { country: "in" }, bounds: new google.maps.LatLngBounds({ lat: 17.2, lng: 78.2 }, { lat: 17.6, lng: 78.7 }), strictBounds: false }}>
                    <Input placeholder="e.g. Gachibowli" value={destText} onChange={(e) => setDestText(e.target.value)} bg={INPUT_BG} borderColor={BORDER} borderRadius="10px" color={PRIMARY} />
                  </Autocomplete>
                )}
              </Field>
              <Field label="PAX">
                <Input type="number" min={1} max={6} value={passengers} onChange={(e) => setPassengers(Number(e.target.value))} bg={INPUT_BG} borderColor={BORDER} borderRadius="10px" color={PRIMARY} />
              </Field>
              <Field label="DEPARTURE">
                <Input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} bg={INPUT_BG} borderColor={BORDER} borderRadius="10px" color={PRIMARY} />
              </Field>
            </Grid>

            <Flex align="center" gap={6} flexWrap="wrap">
              <Flex align="center" gap={2} cursor="pointer" onClick={() => setRoundTrip(!roundTrip)}>
                <Box w="18px" h="18px" borderRadius="5px" border={`2px solid ${roundTrip ? BLUE : BORDER}`}
                  bg={roundTrip ? BLUE : "white"} display="flex" alignItems="center" justifyContent="center"
                  style={{ transition: "all 0.18s ease" }}>
                  {roundTrip && <Text color="white" fontSize="11px" lineHeight="1">✓</Text>}
                </Box>
                <Text fontSize="sm" color={MUTED} fontWeight="500">Round trip</Text>
              </Flex>
              <Flex align="center" gap={2}>
                <Text fontSize="sm" color={MUTED}>Weekly budget ₹</Text>
                <Input type="number" min={0} placeholder="e.g. 500"
                  value={weeklyBudget} onChange={(e) => setWeeklyBudget(e.target.value === "" ? "" : Number(e.target.value))}
                  bg={INPUT_BG} borderColor={BORDER} borderRadius="8px" color={PRIMARY} w="110px" h="34px" fontSize="sm" />
              </Flex>
              <Button onClick={handleSubmit} loading={isGeocoding} size="md"
                style={{ background: `linear-gradient(135deg,${BLUE},${PURPLE})`, color: "#fff", fontWeight: "700", borderRadius: "10px", padding: "10px 24px", marginLeft: "auto", boxShadow: "0 4px 18px rgba(26,86,219,0.35)" }}>
                Plan My Week →
              </Button>
            </Flex>
            {geoError && <Text color={RED} mt={2} fontSize="sm">{geoError}</Text>}
          </Box>

          {/* ── Empty State ── */}
          {!planRequest ? (
            <Box
              textAlign="center" py={14} borderRadius="28px"
              style={{
                background: "linear-gradient(135deg,rgba(16,185,129,0.05),rgba(26,86,219,0.05))",
                border: "1.5px dashed #6ee7b7",
                animation: "slideUpFade 0.5s 0.2s both",
              }}
            >
              <Text fontSize="4rem" mb={4}>📅</Text>
              <Heading size="lg" color={PRIMARY} mb={3} fontWeight="800">Plan Your Week</Heading>
              <Text color={MUTED} maxW="460px" mx="auto" mb={6} lineHeight="1.7" fontSize="sm">
                Get a 7-day commute plan with weather forecasts, Indian holiday alerts, surge warnings, best departure windows and a weekly budget tracker
              </Text>
            </Box>
          ) : weeklyQuery.isLoading ? (
            <VStack gap={4}>
              {[0,1,2].map((i) => (
                <Box key={i} borderRadius="20px" overflow="hidden" position="relative" w="full">
                  <Skeleton h="100px" borderRadius="20px" />
                  <Box position="absolute" inset="0" style={{
                    background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)",
                    animation: `shimmerSlide 1.8s ${i*0.2}s ease-in-out infinite`,
                  }} />
                </Box>
              ))}
            </VStack>
          ) : weeklyQuery.isError ? (
            <Box textAlign="center" py={8} borderRadius="20px" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
              <Text color={MUTED} mb={3}>Could not load data — check backend connection</Text>
              <Button size="sm" variant="outline" onClick={() => weeklyQuery.refetch()}>Retry</Button>
            </Box>
          ) : plan ? (
            <>
              {/* ── Alert Strip ── */}
              {(festiveDays.length > 0 || surgeDays.length > 0 || rainDays.length > 0 || departureTipDays.length > 0) && (
                <VStack gap={3} align="stretch" style={{ animation: "slideUpFade 0.4s both" }}>
                  {festiveDays.length > 0 && (
                    <Box borderRadius="16px" p={4}
                      style={{ background: "linear-gradient(135deg,rgba(217,70,239,0.08),rgba(255,255,255,0.95))", border: "1.5px solid rgba(217,70,239,0.3)" }}>
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
                    <Box borderRadius="16px" p={4}
                      style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.08),rgba(255,255,255,0.95))", border: "1.5px solid rgba(245,158,11,0.3)" }}>
                      <Flex align="center" gap={3}>
                        <Text fontSize="xl">⚡</Text>
                        <Box>
                          <Text fontWeight="700" fontSize="sm" color="#92400e">Surge pricing expected</Text>
                          <Text fontSize="xs" color={MUTED}>{surgeDays.map((d) => d.day_name).join(", ")} — consider metro or bus on these days</Text>
                        </Box>
                      </Flex>
                    </Box>
                  )}
                  {rainDays.length > 0 && (
                    <Box borderRadius="16px" p={4}
                      style={{ background: "linear-gradient(135deg,rgba(26,86,219,0.08),rgba(255,255,255,0.95))", border: "1.5px solid rgba(26,86,219,0.3)" }}>
                      <Flex align="center" gap={3}>
                        <Text fontSize="xl">🌧️</Text>
                        <Box>
                          <Text fontWeight="700" fontSize="sm" color="#1e40af">Rain forecast</Text>
                          <Text fontSize="xs" color={MUTED}>{rainDays.map((d) => d.day_name).join(", ")} — fixed-schedule modes recommended</Text>
                        </Box>
                      </Flex>
                    </Box>
                  )}
                  {departureTipDays.length > 0 && (
                    <Box borderRadius="16px" p={4}
                      style={{ background: "linear-gradient(135deg,rgba(16,185,129,0.08),rgba(255,255,255,0.95))", border: "1.5px solid rgba(16,185,129,0.3)" }}>
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

              {/* ── Weekly Budget Tracker ── */}
              {budgetNum > 0 && (
                <Box borderRadius="20px" p={6}
                  style={{
                    background: overBudget
                      ? "linear-gradient(135deg,rgba(239,68,68,0.07),rgba(255,255,255,0.97))"
                      : "linear-gradient(135deg,rgba(16,185,129,0.07),rgba(255,255,255,0.97))",
                    border: `1.5px solid ${overBudget ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}`,
                    boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
                    animation: "slideUpFade 0.4s 0.1s both",
                  }}
                >
                  <Flex align="center" justify="space-between" mb={4}>
                    <Text fontSize="0.6rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase">Weekly Budget</Text>
                    <Text fontSize="sm" fontWeight="800" color={overBudget ? RED : GREEN}>
                      {overBudget ? `₹${Math.round(plan.total_estimated_cost_inr - budgetNum)} over budget` : `₹${Math.round(budgetNum - plan.total_estimated_cost_inr)} remaining`}
                    </Text>
                  </Flex>
                  <Box h="10px" bg={BORDER} borderRadius="full" overflow="hidden" mb={3}>
                    <Box h="100%" borderRadius="full"
                      bg={overBudget ? RED : budgetPct > 80 ? AMBER : GREEN}
                      w={`${budgetPct}%`}
                      style={{ transition: "width 0.8s cubic-bezier(0.22,1,0.36,1)" }} />
                  </Box>
                  <Flex justify="space-between" fontSize="xs" color={MUTED}>
                    <Text>₹0</Text>
                    <Text fontWeight="700" color={PRIMARY}>₹{Math.round(plan.total_estimated_cost_inr)} spent</Text>
                    <Text>₹{budgetNum}</Text>
                  </Flex>
                </Box>
              )}

              {/* ── 7-Day Plan ── */}
              <Box
                borderRadius="28px" overflow="hidden"
                style={{
                  boxShadow: "0 8px 40px rgba(0,0,0,0.09)",
                  border: "1px solid rgba(226,232,240,0.7)",
                  animation: "slideUpFade 0.5s 0.15s both",
                }}
              >
                {/* Table header bar */}
                <Box px={6} py={5}
                  style={{
                    background: "linear-gradient(135deg,#0f172a 0%,#064e3b 60%,#0c4a6e 100%)",
                    backgroundSize: "200% 200%",
                    animation: "gradientShift 8s ease infinite",
                  }}
                >
                  <Flex align="center" justify="space-between">
                    <Box>
                      <Text fontSize="0.6rem" color="rgba(255,255,255,0.45)" fontWeight="700" letterSpacing="1.8px" textTransform="uppercase" mb={0.5}>
                        7-Day Plan
                      </Text>
                      <Heading size="sm" color="#fff" fontWeight="800">Your Week Ahead</Heading>
                    </Box>
                    <Text fontSize="xs" color="rgba(255,255,255,0.4)" fontWeight="600">
                      {formatTime(plan.total_time_min)} total · {plan.weekly_plan.length} days
                    </Text>
                  </Flex>
                </Box>

                {/* Column headers */}
                <Box bg="#f8fafc" borderBottom={`1px solid ${BORDER}`}>
                  <Grid templateColumns="90px 70px 36px 1fr 95px 55px 80px" gap={3} px={5} py={2.5}
                    fontSize="0.58rem" fontWeight="800" color={MUTED} letterSpacing="1.2px" textTransform="uppercase">
                    <Text>Day</Text>
                    <Text>Date</Text>
                    <Text>WX</Text>
                    <Text>Mode & Reason</Text>
                    <Text textAlign="right">Cost</Text>
                    <Text textAlign="right">Time</Text>
                    <Text textAlign="center">Risk</Text>
                  </Grid>
                </Box>

                {/* Rows */}
                <Box bg={CARD}>
                  {plan.weekly_plan.map((day, i) => (
                    <Box
                      key={i}
                      className="day-row"
                      style={{
                        borderBottom: i < plan.weekly_plan.length - 1 ? `1px solid ${INPUT_BG}` : "none",
                        background: day === worstDay ? "rgba(239,68,68,0.04)" : day.is_festival ? "rgba(217,70,239,0.04)" : "transparent",
                        borderLeft: day === worstDay ? `3px solid ${RED}` : day.is_festival ? "3px solid #d946ef" : "3px solid transparent",
                        animation: `floatIn 0.42s ${Math.min(i * 0.05, 0.35)}s both`,
                      }}
                    >
                      <Grid templateColumns="90px 70px 36px 1fr 95px 55px 80px" gap={3} px={5} py={3.5} alignItems="center">
                        <Flex align="center" gap={1.5}>
                          <Text fontSize="lg">{getModeEmoji(day.recommended_mode)}</Text>
                          <Box>
                            <Flex align="center" gap={1}>
                              <Text fontWeight="700" fontSize="sm" color={PRIMARY}>{day.day_name.slice(0, 3)}</Text>
                              {day.is_surge_day && <Text fontSize="0.6rem" title="Surge">⚡</Text>}
                            </Flex>
                            {day.is_festival && <Text fontSize="0.55rem" color="#86198f" fontWeight="700">🎉</Text>}
                          </Box>
                        </Flex>

                        <Text fontSize="xs" color={MUTED}>{day.date.slice(5)}</Text>

                        <Text fontSize="lg" title={day.weather_desc}>
                          {getWeatherEmoji(day.weather_code, day.is_raining)}
                        </Text>

                        <Box>
                          <Text fontSize="sm" fontWeight="700" color={PRIMARY} textTransform="capitalize">
                            {day.recommended_mode.replace("_", " ")}{day.variant ? ` · ${day.variant}` : ""}
                          </Text>
                          <Text fontSize="xs" color={MUTED}>{day.reason}</Text>
                          {day.best_departure_label && (
                            <Text fontSize="xs" color={GREEN} fontWeight="700">⏰ {day.best_departure_label}</Text>
                          )}
                          {day.is_festival && day.festival_name && (
                            <Text fontSize="xs" color="#86198f">{day.festival_name}</Text>
                          )}
                        </Box>

                        <Text textAlign="right" fontWeight="800" fontSize="xs" color={PRIMARY}>{day.cost_display}</Text>
                        <Text textAlign="right" fontSize="xs" color={MUTED}>{day.time_min}m</Text>

                        <Flex justify="center">
                          <Box px={2} py={0.5} borderRadius="full" fontSize="0.6rem" fontWeight="800" textTransform="uppercase"
                            style={{ background: getRiskBg(day.risk_level), color: getRiskTextColor(day.risk_level) }}>
                            {day.risk_level}
                          </Box>
                        </Flex>
                      </Grid>
                    </Box>
                  ))}
                </Box>
              </Box>

              {/* ── Risk + Weather Strip ── */}
              <Box
                borderRadius="24px" overflow="hidden"
                style={{
                  boxShadow: "0 4px 20px rgba(0,0,0,0.07)",
                  border: "1px solid rgba(226,232,240,0.6)",
                  animation: "slideUpFade 0.5s 0.2s both",
                }}
              >
                <Box px={6} py={4}
                  style={{
                    background: "linear-gradient(135deg,#0f172a,#1e1b4b)",
                    borderBottom: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <Text fontSize="0.6rem" color="rgba(255,255,255,0.45)" fontWeight="700" letterSpacing="1.8px" textTransform="uppercase">
                    Risk & Weather Overview
                  </Text>
                </Box>
                <Box bg={CARD} p={4}>
                  <Flex gap={2}>
                    {plan.weekly_plan.map((day, i) => (
                      <Box key={i} flex="1" borderRadius="14px" overflow="hidden" border={`1px solid ${BORDER}`}
                        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                        <Box p={2} textAlign="center" style={{ background: `linear-gradient(135deg, ${getRiskColor(day.risk_level)}, ${getRiskColor(day.risk_level)}bb)` }}>
                          <Text fontSize="xs" color="white" fontWeight="800">{day.day_name.slice(0, 3)}</Text>
                          {day.is_surge_day && <Text fontSize="0.5rem" color="white">⚡</Text>}
                        </Box>
                        <Box bg={CARD} p={2} textAlign="center">
                          <Text fontSize="lg">{getWeatherEmoji(day.weather_code, day.is_raining)}</Text>
                          <Text fontSize="0.55rem" color={MUTED}>{day.weather_desc}</Text>
                          {day.is_festival && <Text fontSize="0.55rem" color="#86198f">🎉</Text>}
                        </Box>
                      </Box>
                    ))}
                  </Flex>
                </Box>
              </Box>
            </>
          ) : null}
        </VStack>
      </Container>
    </Box>
  )
}