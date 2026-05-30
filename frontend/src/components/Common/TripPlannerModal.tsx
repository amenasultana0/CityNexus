import { useState } from "react"
import { Box, Flex, Text, VStack } from "@chakra-ui/react"
import {
  X, Clock, Calendar, AlertTriangle, CloudRain,
  ChevronDown, ChevronUp, MapPin
} from "lucide-react"
import {
  planTrip,
  getAlternatives,
  geocodeGoogle,
  type PlanTripResponse,
  type TransportOption,
} from "@/lib/api"

// ── Theme tokens ──────────────────────────────────────────────
const CARD    = "#ffffff"
const BORDER  = "#e2e8f0"
const PRIMARY = "#1a202c"
const MUTED   = "#718096"
const INPUT_BG= "#f7fafc"
const GREEN   = "#10b981"
const AMBER   = "#f59e0b"
const RED     = "#ef4444"
const TEAL    = "#0694a2"

// ── Helpers ───────────────────────────────────────────────────
function alertIcon(type: string) {
  if (type === "rain") return <CloudRain size={13} style={{ flexShrink: 0 }} />
  return <AlertTriangle size={13} style={{ flexShrink: 0 }} />
}

function confidenceColor(label: string) {
  if (label === "High confidence") return GREEN
  if (label === "Moderate confidence") return AMBER
  return RED
}

const MODE_EMOJI: Record<string, string> = {
  metro: "🚇", bus: "🚌", auto: "🛺",
  cab: "🚗", bike: "🛵",
  Mini: "🚗", Sedan: "🚗", Suv: "🚙",
  Metro: "🚇", Bus: "🚌", Auto: "🛺", Bike: "🛵",
}
function modeEmoji(mode: string) {
  return MODE_EMOJI[mode] ?? "🚌"
}

// Generate next 7 days as { label, offset }
function getNextSevenDays() {
  const days = []
  const now = new Date()
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  for (let i = 0; i < 7; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)
    const label = i === 0
      ? "Today"
      : i === 1
      ? "Tomorrow"
      : `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}`
    days.push({ label, offset: i })
  }
  return days
}

// Filter reasons that don't make sense for a given mode
function filterReasons(reasons: string[], mode: string): string[] {
  const isPublic = mode === "Metro" || mode === "Bus"
  const filtered = reasons.filter(r => {
    if (isPublic && r.toLowerCase().includes("chokepoint")) return false
    if (isPublic && r.toLowerCase().includes("surge")) return false
    if (isPublic && r.toLowerCase().includes("driver supply")) return false
    return true
  })
  // If high cancellation reason exists, drop the "no surge" reason — they contradict
  const hasHighCancel = filtered.some(r => r.toLowerCase().includes("high cancellation"))
  return filtered
    .filter(r => hasHighCancel ? !r.toLowerCase().includes("no surge") : true)
    .slice(0, 1) // show only the single most important reason
}

// ── Props ─────────────────────────────────────────────────────
interface TripPlannerModalProps {
  isOpen: boolean
  onClose: () => void
  // Pre-filled from dashboard (optional — user can override inside modal)
  initialOrigin?: string
  initialDest?: string
  initialOriginLat?: number
  initialOriginLon?: number
  initialDestLat?: number
  initialDestLon?: number
}

interface PlanResult {
  plan: PlanTripResponse
  alternatives: TransportOption[]
  bestMode: TransportOption | null
  leaveHour: number
  leaveMinute: number
}

// ── Modal ─────────────────────────────────────────────────────
export default function TripPlannerModal({
  isOpen,
  onClose,
  initialOrigin = "",
  initialDest = "",
  initialOriginLat,
  initialOriginLon,
  initialDestLat,
  initialDestLon,
}: TripPlannerModalProps) {
  const [originText, setOriginText] = useState(initialOrigin)
  const [destText,   setDestText]   = useState(initialDest)
  const [arriveTime, setArriveTime] = useState("09:00")
  const [dayOffset,  setDayOffset]  = useState(1)
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<PlanResult | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [showAlts,   setShowAlts]   = useState(true)

  const days = getNextSevenDays()

  if (!isOpen) return null

  async function handlePlan() {
    if (!originText || !destText) {
      setError("Enter both origin and destination.")
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      // 1. Geocode if needed (use pre-filled coords if origin/dest unchanged)
      let oLat = initialOriginLat, oLon = initialOriginLon
      let dLat = initialDestLat,  dLon = initialDestLon

      if (originText !== initialOrigin || !oLat) {
        const g = await geocodeGoogle(originText)
        oLat = g.lat; oLon = g.lon
      }
      if (destText !== initialDest || !dLat) {
        const g = await geocodeGoogle(destText)
        dLat = g.lat; dLon = g.lon
      }

      if (!oLat || !oLon || !dLat || !dLon) {
        setError("Could not find one of the locations.")
        return
      }

      const [h, m] = arriveTime.split(":").map(Number)

      // 2. Get best departure time from plan-trip
      const plan = await planTrip({
        origin_lat: oLat,
        origin_lon: oLon,
        dest_lat: dLat,
        dest_lon: dLon,
        arrive_by_hour: h,
        arrive_by_minute: m,
        day_offset: dayOffset,
      })

      const leaveHour   = plan.best.leave_hour
      const leaveMinute = plan.best.leave_minute

      // 3. Get real transport alternatives at that departure hour
      const now = new Date()
      const dow = (now.getDay() + dayOffset - 1) % 7  // approx day of week
      const altsData = await getAlternatives({
        origin_lat: oLat,
        origin_lon: oLon,
        dest_lat: dLat,
        dest_lon: dLon,
        passengers: 1,
        hour: leaveHour,
        day_of_week: dow,
      })

      const available = altsData.options.filter(o => o.available)

      // 4. Pick best mode using same scoring as dashboard
      const riskOrder: Record<string, number> = { low: 0, moderate: 1, high: 2 }
      const maxCost = Math.max(...available.map(o => o.cost_inr), 1)
      const maxTime = Math.max(...available.map(o => o.time_min), 1)
      const sorted = [...available].sort((a, b) => {
        const score = (o: typeof a) => {
          const r = (riskOrder[o.risk_level] ?? 1) / 2
          const c = o.cost_inr / maxCost
          const t = o.time_min / maxTime
          return 0.35 * r + 0.35 * c + 0.30 * t
        }
        return score(a) - score(b)
      })

      const bestMode = sorted[0] ?? null
      // Alternatives = everything except best mode
      const alts = sorted.slice(1, 4)

      setResult({ plan, alternatives: alts, bestMode, leaveHour, leaveMinute })
    } catch (e) {
      setError("Could not load plan. Check your connection.")
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  function fmtTime(h: number, m: number) {
    const h12 = h % 12 || 12
    const ampm = h < 12 ? "AM" : "PM"
    return `${h12}:${String(m).padStart(2,"0")} ${ampm}`
  }

  return (
    <Box
      position="fixed"
      inset="0"
      zIndex={50}
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="blackAlpha.500"
      px={4}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <Box
        bg={CARD}
        borderRadius="20px"
        border={`1px solid ${BORDER}`}
        w="100%"
        maxW="520px"
        boxShadow="0 24px 48px rgba(0,0,0,0.18)"
        overflow="hidden"
        maxH="92vh"
        display="flex"
        flexDirection="column"
      >
        {/* ── Header ── */}
        <Flex
          align="center"
          justify="space-between"
          px={6}
          py={4}
          borderBottom={`1px solid ${BORDER}`}
          flexShrink={0}
        >
          <Box>
            <Text fontSize="13px" fontWeight="600" color={PRIMARY}>Smart Trip Planner</Text>
            <Text fontSize="11px" color={MUTED}>When should I leave to arrive on time?</Text>
          </Box>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, display: "flex", alignItems: "center",
              justifyContent: "center", borderRadius: 8,
              border: `1px solid ${BORDER}`, background: "transparent",
              cursor: "pointer", color: MUTED,
            }}
          >
            <X size={15} />
          </button>
        </Flex>

        {/* ── Inputs ── */}
        <Box px={6} pt={4} pb={3} borderBottom={`1px solid ${BORDER}`} flexShrink={0}>
          {/* Origin + Destination */}
          <Flex gap={3} mb={3}>
            <Box flex={1}>
              <Text fontSize="11px" color={MUTED} mb={1}>FROM</Text>
              <Flex
                align="center"
                gap={2}
                px={3}
                py={2}
                borderRadius="8px"
                border={`1px solid ${BORDER}`}
                bg={INPUT_BG}
              >
                <MapPin size={14} color={MUTED} />
                <input
                  value={originText}
                  onChange={e => setOriginText(e.target.value)}
                  placeholder="e.g. Tolichowki"
                  style={{
                    border: "none", background: "transparent",
                    fontSize: "13px", color: PRIMARY, outline: "none", width: "100%",
                  }}
                />
              </Flex>
            </Box>
            <Box flex={1}>
              <Text fontSize="11px" color={MUTED} mb={1}>TO</Text>
              <Flex
                align="center"
                gap={2}
                px={3}
                py={2}
                borderRadius="8px"
                border={`1px solid ${BORDER}`}
                bg={INPUT_BG}
              >
                <MapPin size={14} color={TEAL} />
                <input
                  value={destText}
                  onChange={e => setDestText(e.target.value)}
                  placeholder="e.g. Hitech City"
                  style={{
                    border: "none", background: "transparent",
                    fontSize: "13px", color: PRIMARY, outline: "none", width: "100%",
                  }}
                />
              </Flex>
            </Box>
          </Flex>

          {/* Arrive by + Date + Plan button */}
          <Flex align="flex-end" gap={3}>
            <Box flex={1}>
              <Text fontSize="11px" color={MUTED} mb={1}>REACH BY</Text>
              <Flex align="center" gap={2} px={3} py={2} borderRadius="8px" border={`1px solid ${BORDER}`} bg={INPUT_BG}>
                <Clock size={14} color={MUTED} />
                <input
                  type="time"
                  value={arriveTime}
                  onChange={e => setArriveTime(e.target.value)}
                  style={{
                    border: "none", background: "transparent",
                    fontSize: "14px", fontWeight: "500",
                    color: PRIMARY, outline: "none",
                  }}
                />
              </Flex>
            </Box>
            <Box flex={1}>
              <Text fontSize="11px" color={MUTED} mb={1}>DATE</Text>
              <Flex align="center" gap={2} px={3} py={2} borderRadius="8px" border={`1px solid ${BORDER}`} bg={INPUT_BG}>
                <Calendar size={14} color={MUTED} />
                <select
                  value={dayOffset}
                  onChange={e => setDayOffset(Number(e.target.value))}
                  style={{
                    border: "none", background: "transparent",
                    fontSize: "13px", color: PRIMARY,
                    outline: "none", cursor: "pointer", width: "100%",
                  }}
                >
                  {days.map(d => (
                    <option key={d.offset} value={d.offset}>{d.label}</option>
                  ))}
                </select>
              </Flex>
            </Box>
            <button
              onClick={handlePlan}
              disabled={loading}
              style={{
                background: loading ? MUTED : PRIMARY,
                color: CARD, fontSize: "13px", fontWeight: "600",
                padding: "10px 20px", borderRadius: "8px",
                border: "none", cursor: loading ? "not-allowed" : "pointer",
                whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              {loading ? "..." : "Plan →"}
            </button>
          </Flex>
        </Box>

        {/* ── Body ── */}
        <Box px={6} pt={4} pb={5} overflowY="auto" flex={1}>

          {error && <Text fontSize="13px" color={RED} mb={3}>{error}</Text>}

          {/* Empty state */}
          {!result && !loading && !error && (
            <Flex direction="column" align="center" py={8} gap={2}>
              <Text fontSize="32px">🗓️</Text>
              <Text fontSize="14px" color={PRIMARY} fontWeight="500">Plan your trip</Text>
              <Text fontSize="12px" color={MUTED} textAlign="center">
                Enter where you're going, when you need to arrive, and get the best departure time
              </Text>
            </Flex>
          )}

          {loading && (
            <Flex direction="column" align="center" py={8} gap={2}>
              <Text fontSize="13px" color={MUTED}>Checking surge, demand & weather forecast...</Text>
            </Flex>
          )}

          {result && (() => {
            const { plan, alternatives, bestMode, leaveHour, leaveMinute } = result
            const best = plan.best
            const modeName = bestMode
              ? (bestMode.variant
                  ? bestMode.variant.charAt(0).toUpperCase() + bestMode.variant.slice(1)
                  : bestMode.mode.charAt(0).toUpperCase() + bestMode.mode.slice(1))
              : best.mode
            const fareDisplay = bestMode?.cost_display ?? best.fare_display
            const travelMin   = bestMode?.time_min ?? best.duration_min
            const filteredReasons = filterReasons(best.reasons, modeName)

            return (
              <VStack gap={3} align="stretch">

                {/* Best option card */}
                <Box bg={INPUT_BG} border={`1px solid ${BORDER}`} borderRadius="12px" p={4}>
                  <Flex align="center" gap={2} mb={3}>
                    <Box w="8px" h="8px" borderRadius="full" bg={GREEN} />
                    <Text fontSize="11px" color={MUTED}>best option</Text>
                    <Box ml="auto" px={2} py={0.5} borderRadius="6px" bg="#e1f5ee" fontSize="11px" color="#085041" fontWeight="600">
                      {best.label}
                    </Box>
                  </Flex>

                  <Text fontSize="24px" fontWeight="500" color={PRIMARY} mb={1}>
                    Leave at {fmtTime(leaveHour, leaveMinute)}
                  </Text>
                  <Text fontSize="12px" color={MUTED} mb={3}>
                    Arrive by {best.arrive_time_label} · {best.buffer_min} min buffer
                  </Text>

                  <Flex gap={6} mb={3}>
                    <Box>
                      <Text fontSize="18px" fontWeight="500" color={PRIMARY}>{fareDisplay}</Text>
                      <Text fontSize="11px" color={MUTED}>estimated fare</Text>
                    </Box>
                    <Box>
                      <Text fontSize="18px" fontWeight="500" color={PRIMARY}>{travelMin} min</Text>
                      <Text fontSize="11px" color={MUTED}>travel time</Text>
                    </Box>
                    <Box>
                      <Text fontSize="18px" fontWeight="500" color={PRIMARY}>
                        {modeEmoji(modeName)} {modeName}
                      </Text>
                      <Text fontSize="11px" color={MUTED}>mode</Text>
                    </Box>
                  </Flex>

                  {filteredReasons.length > 0 && (
                    <Box borderTop={`1px solid ${BORDER}`} pt={2}>
                      {filteredReasons.map((r, i) => (
                        <Text key={i} fontSize="12px" color={MUTED} mb={0.5}>
                          <Text as="span" color={PRIMARY}>· </Text>{r}
                        </Text>
                      ))}
                    </Box>
                  )}
                </Box>

                {/* Alternatives — other modes, same departure time */}
                {alternatives.length > 0 && (
                  <>
                    <Flex align="center" justify="space-between">
                      <Text fontSize="12px" color={MUTED}>
                        other modes at {fmtTime(leaveHour, leaveMinute)}
                      </Text>
                      <button
                        onClick={() => setShowAlts(!showAlts)}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          fontSize: "12px", color: MUTED,
                          background: "transparent", border: "none", cursor: "pointer",
                        }}
                      >
                        {showAlts ? "hide" : "show"}
                        {showAlts ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    </Flex>

                    {showAlts && (
                      <Flex gap={2} flexWrap="wrap">
                        {alternatives.map((alt, i) => (
                          <Box
                            key={i}
                            flex="1"
                            minW="130px"
                            bg={CARD}
                            border={`1px solid ${BORDER}`}
                            borderRadius="10px"
                            p={3}
                          >
                            <Text fontSize="12px" color={MUTED} mb={1} textTransform="capitalize">
                              {modeEmoji(alt.mode)} {alt.variant ? alt.variant : alt.mode}
                            </Text>
                            <Text fontSize="14px" fontWeight="500" color={PRIMARY}>
                              {alt.cost_display}
                            </Text>
                            <Text fontSize="11px" color={MUTED}>{alt.time_min} min</Text>
                            <Text fontSize="11px" color={
                              alt.risk_level === "low" ? GREEN
                              : alt.risk_level === "moderate" ? AMBER : RED
                            }>
                              {alt.risk_level} risk
                            </Text>
                          </Box>
                        ))}
                      </Flex>
                    )}
                  </>
                )}

                {/* Metro tip */}
                {plan.metro_tip && (
                  <Box bg="#e6fffa" borderRadius="8px" px={3} py={2}>
                    <Text fontSize="12px" color={TEAL}>🚇 {plan.metro_tip}</Text>
                  </Box>
                )}

                {/* Alerts */}
                {plan.alerts.length > 0 && (
                  <Box bg="#faeeda" borderRadius="8px" px={4} py={3}>
                    <VStack gap={1} align="stretch">
                      {plan.alerts.map((alert, i) => (
                        <Flex key={i} align="center" gap={2}>
                          <Box color="#633806">{alertIcon(alert.type)}</Box>
                          <Text fontSize="12px" color="#633806">{alert.text}</Text>
                        </Flex>
                      ))}
                    </VStack>
                  </Box>
                )}

                {/* Confidence */}
                <Flex align="center" gap={2}>
                  <Box w="6px" h="6px" borderRadius="full" bg={confidenceColor(plan.confidence.label)} />
                  <Text fontSize="11px" color={MUTED}>
                    {plan.confidence.label} — {plan.confidence.detail}
                  </Text>
                </Flex>

              </VStack>
            )
          })()}
        </Box>
      </Box>
    </Box>
  )
}