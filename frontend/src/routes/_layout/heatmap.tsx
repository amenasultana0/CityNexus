import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { Box, Flex, Heading, Text, VStack } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import {
  GoogleMap,
  Marker,
  InfoWindow,
  Polygon,
  Autocomplete,
  DirectionsRenderer,
  TrafficLayer,
  useJsApiLoader,
} from "@react-google-maps/api"
import { MapPin, Navigation, ArrowDown } from "lucide-react"
import { getOptimalPickup, PickupSuggestion } from "@/lib/api"

export const Route = createFileRoute("/_layout/heatmap")({
  component: HeatmapPage,
})

const LIBRARIES: ("places")[] = ["places"]

// ── Design tokens ─────────────────────────────────────────────
const PRIMARY  = "#1a202c"
const MUTED    = "#718096"
const SUBTLE   = "#a0aec0"
const BORDER   = "#e2e8f0"
const INPUT_BG = "#f7fafc"
const CARD     = "#ffffff"
const BLUE     = "#1a56db"
const GREEN    = "#10b981"
const PURPLE   = "#7c3aed"

// ── Stop-type config ──────────────────────────────────────────
const STOP_CONFIG: Record<string, { label: string; emoji: string; color: string; bg: string; routeColor: string }> = {
  metro: { label: "Metro",  emoji: "🚇", color: "#1d4ed8", bg: "rgba(29,78,216,0.12)",  routeColor: "#3b82f6" },
  mmts:  { label: "MMTS",   emoji: "🚂", color: "#d97706", bg: "rgba(217,119,6,0.12)",   routeColor: "#f59e0b" },
  bus:   { label: "Bus",    emoji: "🚌", color: "#059669", bg: "rgba(5,150,105,0.12)",   routeColor: "#10b981" },
}

function stopCfg(type: string) {
  return STOP_CONFIG[type] ?? { label: type.toUpperCase(), emoji: "📍", color: MUTED, bg: "#f1f5f9", routeColor: "#94a3b8" }
}

function stopMarkerUrl(type: string) {
  const cfg = stopCfg(type)
  const size = 40
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-2}" fill="${cfg.color}" stroke="white" stroke-width="2.5"/>
      <text x="${size/2}" y="${size/2+6}" text-anchor="middle" font-size="18" font-family="sans-serif">${cfg.emoji}</text>
    </svg>`
  )}`
}

function pinMarkerUrl(color: string, emoji: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 0C9 0 0 9 0 20c0 15 20 32 20 32s20-17 20-32C40 9 31 0 20 0z" fill="${color}"/>
      <circle cx="20" cy="20" r="12" fill="white"/>
      <text x="20" y="26" text-anchor="middle" font-size="14" font-family="sans-serif">${emoji}</text>
    </svg>`
  )}`
}

type LocationPoint = { lat: number; lng: number }

// ── Stop card ─────────────────────────────────────────────────
function StopCard({
  stop, index, onClick, isSelected,
}: {
  stop: PickupSuggestion
  index: number
  onClick: () => void
  isSelected: boolean
}) {
  const cfg = stopCfg(stop.stop_type)
  const barW = Math.min(100, stop.walk_min * 8)

  return (
    <Box
      className="stop-card"
      as="button"
      w="full"
      textAlign="left"
      onClick={onClick}
      style={{
        animation: `floatIn 0.4s ${index * 0.07}s cubic-bezier(0.22,1,0.36,1) both`,
        background: isSelected ? cfg.bg : CARD,
        border: `1.5px solid ${isSelected ? cfg.color : BORDER}`,
        borderLeft: `4px solid ${cfg.color}`,
        borderRadius: "16px",
        padding: "14px 16px",
        cursor: "pointer",
        boxShadow: isSelected ? `0 4px 20px ${cfg.color}30` : "0 2px 8px rgba(0,0,0,0.04)",
        transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease, background 0.18s ease",
      }}
    >
      <Flex align="center" gap={3}>
        {/* Icon */}
        <Flex
          w="40px" h="40px" borderRadius="12px" align="center" justify="center"
          fontSize="1.25rem" flexShrink={0}
          style={{ background: cfg.bg, border: `1.5px solid ${cfg.color}30`, boxShadow: `0 3px 10px ${cfg.color}25` }}
        >
          {cfg.emoji}
        </Flex>

        <Box flex={1} minW={0}>
          {/* Name + badge */}
          <Flex align="center" gap={2} mb={1} flexWrap="wrap">
            <Text fontWeight="700" fontSize="sm" color={PRIMARY}
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {stop.name}
            </Text>
            <Box
              px={2} py={0.5} borderRadius="full" fontSize="0.6rem" fontWeight="800"
              style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30`, flexShrink: 0 }}
            >
              {cfg.label}
            </Box>
          </Flex>

          {/* Walk time + bar */}
          <Flex align="center" gap={2}>
            <Text fontSize="0.7rem" color={MUTED} fontWeight="600" flexShrink={0}>
              🚶 {stop.walk_min} min
            </Text>
            <Box flex={1} h="4px" borderRadius="full" bg="#f1f5f9" overflow="hidden">
              <Box
                h="100%" borderRadius="full"
                style={{
                  width: `${barW}%`,
                  background: `linear-gradient(90deg, ${cfg.color}88, ${cfg.color})`,
                  transition: "width 1s cubic-bezier(0.22,1,0.36,1)",
                }}
              />
            </Box>
            <Text fontSize="0.65rem" color={SUBTLE} flexShrink={0}>{stop.distance_m}m</Text>
          </Flex>
        </Box>
      </Flex>
    </Box>
  )
}

// ── Legend row ────────────────────────────────────────────────
function LegendRow({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <Flex align="center" gap={3}>
      <Box flexShrink={0} h="3px" w="28px" borderRadius="full"
        style={{
          background: dashed ? `repeating-linear-gradient(90deg, ${color} 0, ${color} 6px, transparent 6px, transparent 10px)` : color,
        }}
      />
      <Text fontSize="xs" color={MUTED} fontWeight="600">{label}</Text>
    </Flex>
  )
}

// ── Section header ────────────────────────────────────────────
function SectionHeader({ emoji, label, color, count }: { emoji: string; label: string; color: string; count: number }) {
  return (
    <Flex align="center" gap={2} mb={3}>
      <Box
        px={3} py={1.5} borderRadius="999px" display="inline-flex" alignItems="center" gap={1.5}
        style={{
          background: `linear-gradient(135deg, ${color}, ${color}cc)`,
          boxShadow: `0 3px 12px ${color}44`,
        }}
      >
        <Text fontSize="0.9rem">{emoji}</Text>
        <Text fontSize="0.65rem" fontWeight="800" color="#fff" letterSpacing="0.06em" textTransform="uppercase">
          {label}
        </Text>
      </Box>
      <Box px={2} py={0.5} borderRadius="full" bg={INPUT_BG} style={{ border: `1px solid ${BORDER}` }}>
        <Text fontSize="0.65rem" fontWeight="700" color={MUTED}>{count} stop{count !== 1 ? "s" : ""}</Text>
      </Box>
    </Flex>
  )
}

// ── Main page ─────────────────────────────────────────────────
function HeatmapPage() {
  const [pickupText, setPickupText]           = useState("")
  const [destText, setDestText]               = useState("")
  const [origin, setOrigin]                   = useState<LocationPoint | null>(null)
  const [destination, setDestination]         = useState<LocationPoint | null>(null)
  const [selectedStop, setSelectedStop]       = useState<PickupSuggestion | null>(null)
  const [loadingStops, setLoadingStops]       = useState(false)
  const [pickupStops, setPickupStops]         = useState<PickupSuggestion[]>([])
  const [destinationStops, setDestinationStops] = useState<PickupSuggestion[]>([])
  const [directions, setDirections]           = useState<google.maps.DirectionsResult | null>(null)
  const [pickupStopRoutes, setPickupStopRoutes]           = useState<google.maps.DirectionsResult[]>([])
  const [destinationStopRoutes, setDestinationStopRoutes] = useState<google.maps.DirectionsResult[]>([])

  const mapRef      = useRef<google.maps.Map | null>(null)
  const pickupRef   = useRef<google.maps.places.Autocomplete | null>(null)
  const destRef     = useRef<google.maps.places.Autocomplete | null>(null)

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  })

  // Pre-fill from dashboard
  useEffect(() => {
    try {
      const stored = localStorage.getItem("tripData")
      if (!stored) return
      const trip = JSON.parse(stored)
      if (trip.pickupText) setPickupText(trip.pickupText)
      if (trip.destText)   setDestText(trip.destText)
      if (trip.pickupLat && trip.pickupLng) setOrigin({ lat: trip.pickupLat, lng: trip.pickupLng })
      if (trip.destLat   && trip.destLng)   setDestination({ lat: trip.destLat, lng: trip.destLng })
    } catch {}
  }, [])

  const fetchNearbyStops = useCallback(async () => {
    if (!origin || !destination) return
    setLoadingStops(true)
    try {
      const [pickupResult, destResult] = await Promise.all([
        getOptimalPickup({ origin_lat: origin.lat,      origin_lon: origin.lng,      radius_m: 1500 }),
        getOptimalPickup({ origin_lat: destination.lat, origin_lon: destination.lng, radius_m: 1500 }),
      ])
      const allowed = ["metro", "bus", "mmts"]
      setPickupStops(pickupResult.suggestions.filter((s) => allowed.includes(s.stop_type)))
      setDestinationStops(destResult.suggestions.filter((s) => allowed.includes(s.stop_type)))
    } catch (e) {
      console.error("Failed loading transit stops", e)
    } finally {
      setLoadingStops(false)
    }
  }, [origin, destination])

  useEffect(() => {
    if (origin && destination) fetchNearbyStops()
  }, [origin, destination, fetchNearbyStops])

  // Fit map to route
  useEffect(() => {
    if (!mapRef.current || !origin || !destination) return
    const bounds = new google.maps.LatLngBounds()
    bounds.extend(origin)
    bounds.extend(destination)
    mapRef.current.fitBounds(bounds)
  }, [origin, destination])

  // Build directions
  useEffect(() => {
    if (!origin || !destination || !isLoaded) return
    if (!pickupStops.length && !destinationStops.length) return
    const svc = new google.maps.DirectionsService()

    svc.route({ origin, destination, travelMode: google.maps.TravelMode.DRIVING },
      (r, s) => { if (s === "OK" && r) setDirections(r) })

    ;(async () => {
      const pRoutes: (google.maps.DirectionsResult | null)[] = []
      for (const stop of pickupStops) {
        await new Promise((r) => setTimeout(r, 200))
        const res = await new Promise<google.maps.DirectionsResult | null>((resolve) =>
          svc.route({ origin, destination: { lat: stop.lat, lng: stop.lon }, travelMode: google.maps.TravelMode.WALKING },
            (r, s) => resolve(s === "OK" && r ? r : null))
        )
        pRoutes.push(res)
      }
      setPickupStopRoutes(pRoutes.filter(Boolean) as google.maps.DirectionsResult[])

      const dRoutes: (google.maps.DirectionsResult | null)[] = []
      for (const stop of destinationStops) {
        await new Promise((r) => setTimeout(r, 200))
        const res = await new Promise<google.maps.DirectionsResult | null>((resolve) =>
          svc.route({ origin: destination, destination: { lat: stop.lat, lng: stop.lon }, travelMode: google.maps.TravelMode.WALKING },
            (r, s) => resolve(s === "OK" && r ? r : null))
        )
        dRoutes.push(res)
      }
      setDestinationStopRoutes(dRoutes.filter(Boolean) as google.maps.DirectionsResult[])
    })()
  }, [origin, destination, pickupStops, destinationStops, isLoaded])

  const allStops = useMemo(() => [...pickupStops, ...destinationStops], [pickupStops, destinationStops])

  const pickupPolygon = useMemo(() => {
    if (!origin) return []
    const s = 0.008
    return [
      { lat: origin.lat - s, lng: origin.lng - s },
      { lat: origin.lat - s, lng: origin.lng + s },
      { lat: origin.lat + s, lng: origin.lng + s },
      { lat: origin.lat + s, lng: origin.lng - s },
    ]
  }, [origin])

  const destPolygon = useMemo(() => {
    if (!destination) return []
    const s = 0.008
    return [
      { lat: destination.lat - s, lng: destination.lng - s },
      { lat: destination.lat - s, lng: destination.lng + s },
      { lat: destination.lat + s, lng: destination.lng + s },
      { lat: destination.lat + s, lng: destination.lng - s },
    ]
  }, [destination])

  const onPickupPlaceChanged = () => {
    const place = pickupRef.current?.getPlace()
    if (!place?.geometry?.location) return
    setPickupText(place.formatted_address || "")
    setOrigin({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() })
  }

  const onDestPlaceChanged = () => {
    const place = destRef.current?.getPlace()
    if (!place?.geometry?.location) return
    setDestText(place.formatted_address || "")
    setDestination({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() })
  }

  const hasResults = pickupStops.length > 0 || destinationStops.length > 0
  const isReady    = !!origin && !!destination

  // ── Loading splash ─────────────────────────────────────────
  if (!isLoaded) {
    return (
      <Flex h="calc(100vh - 80px)" align="center" justify="center"
        style={{ background: "linear-gradient(135deg,#0f172a,#1e1b4b,#0c4a6e)" }}>
        <style>{CSS_ANIMATIONS}</style>
        <VStack gap={4} textAlign="center">
          <Box fontSize="3rem" style={{ animation: "spinSlow 2s linear infinite" }}>🗺️</Box>
          <Text fontWeight="700" color="#fff" fontSize="lg">Loading Maps…</Text>
          <Text color="rgba(255,255,255,0.45)" fontSize="sm">Connecting to Google Maps API</Text>
        </VStack>
      </Flex>
    )
  }

  return (
    <Flex h="calc(100vh - 80px)" overflow="hidden">
      <style>{CSS_ANIMATIONS}</style>

      {/* ═══════════════════════════════════════
          SIDEBAR
      ═══════════════════════════════════════ */}
      <Box
        w="360px" flexShrink={0}
        overflowY="auto"
        className="sidebar-scroll"
        style={{
          borderRight: `1px solid ${BORDER}`,
          background: CARD,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Sidebar hero header ── */}
        <Box
          flexShrink={0} px={6} pt={7} pb={6}
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #0c4a6e 100%)",
            backgroundSize: "200% 200%",
            animation: "gradientShift 10s ease infinite",
          }}
        >
          {/* Grid texture */}
          <Box position="absolute" inset="0" pointerEvents="none" style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }} />

          <Box position="relative" zIndex={1}>
            {/* Live badge */}
            <Flex align="center" gap={2} mb={3}>
              <Box w="7px" h="7px" borderRadius="full" bg={GREEN}
                style={{ animation: "pulseRing 2s ease-in-out infinite" }} />
              <Text fontSize="0.6rem" color="rgba(255,255,255,0.45)" fontWeight="700" letterSpacing="2px" textTransform="uppercase">
                Transit Map · Hyderabad
              </Text>
            </Flex>

            <Heading
              fontWeight="900" lineHeight="1.05" mb={2}
              style={{
                fontSize: "2rem",
                background: "linear-gradient(135deg, #fff 0%, #a5f3fc 45%, #c4b5fd 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Transit Heatmap
            </Heading>
            <Text color="rgba(255,255,255,0.45)" fontSize="sm" lineHeight="1.6">
              Find metro, MMTS &amp; bus stops near your pickup and destination
            </Text>
          </Box>
        </Box>

        {/* ── Input section ── */}
        <Box px={5} py={5} flexShrink={0} style={{ borderBottom: `1px solid ${BORDER}` }}>
          {/* From */}
          <Box mb={3}>
            <Flex align="center" gap={2} mb={2}>
              <Box w="8px" h="8px" borderRadius="full" bg={BLUE} flexShrink={0} />
              <Text fontSize="0.62rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase">
                From
              </Text>
            </Flex>
            <Flex
              align="center" gap={2} bg={INPUT_BG} borderRadius="12px" px={3} py={2}
              style={{ border: `1.5px solid ${origin ? BLUE : BORDER}`, transition: "border-color 0.2s ease", boxShadow: origin ? `0 0 0 3px ${BLUE}18` : "none" }}
            >
              <MapPin size={14} color={origin ? BLUE : MUTED} style={{ flexShrink: 0 }} />
              {isLoaded ? (
                <Autocomplete
                  onLoad={(ref) => (pickupRef.current = ref)}
                  onPlaceChanged={onPickupPlaceChanged}
                  options={{ componentRestrictions: { country: "in" }, bounds: new google.maps.LatLngBounds({ lat: 17.2, lng: 78.2 }, { lat: 17.6, lng: 78.7 }), strictBounds: false }}
                >
                  <input
                    value={pickupText}
                    onChange={(e) => setPickupText(e.target.value)}
                    placeholder="e.g. Ameerpet"
                    style={{ border: "none", outline: "none", background: "transparent", fontSize: "14px", color: PRIMARY, width: "100%", fontFamily: "inherit" }}
                  />
                </Autocomplete>
              ) : (
                <input placeholder="e.g. Ameerpet" style={{ border: "none", outline: "none", background: "transparent", fontSize: "14px", color: PRIMARY, width: "100%", fontFamily: "inherit" }} />
              )}
            </Flex>
          </Box>

          {/* Connector arrow */}
          <Flex align="center" justify="center" my={1}>
            <Box
              w="28px" h="28px" borderRadius="full" display="flex" alignItems="center" justifyContent="center"
              style={{ background: INPUT_BG, border: `1.5px solid ${BORDER}` }}
            >
              <ArrowDown size={13} color={MUTED} />
            </Box>
          </Flex>

          {/* To */}
          <Box mb={4}>
            <Flex align="center" gap={2} mb={2}>
              <Box w="8px" h="8px" borderRadius="full" bg={GREEN} flexShrink={0} />
              <Text fontSize="0.62rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase">
                To
              </Text>
            </Flex>
            <Flex
              align="center" gap={2} bg={INPUT_BG} borderRadius="12px" px={3} py={2}
              style={{ border: `1.5px solid ${destination ? GREEN : BORDER}`, transition: "border-color 0.2s ease", boxShadow: destination ? `0 0 0 3px ${GREEN}18` : "none" }}
            >
              <Navigation size={14} color={destination ? GREEN : MUTED} style={{ flexShrink: 0 }} />
              {isLoaded ? (
                <Autocomplete
                  onLoad={(ref) => (destRef.current = ref)}
                  onPlaceChanged={onDestPlaceChanged}
                  options={{ componentRestrictions: { country: "in" }, bounds: new google.maps.LatLngBounds({ lat: 17.2, lng: 78.2 }, { lat: 17.6, lng: 78.7 }), strictBounds: false }}
                >
                  <input
                    value={destText}
                    onChange={(e) => setDestText(e.target.value)}
                    placeholder="e.g. Tolichowki"
                    style={{ border: "none", outline: "none", background: "transparent", fontSize: "14px", color: PRIMARY, width: "100%", fontFamily: "inherit" }}
                  />
                </Autocomplete>
              ) : (
                <input placeholder="e.g. Tolichowki" style={{ border: "none", outline: "none", background: "transparent", fontSize: "14px", color: PRIMARY, width: "100%", fontFamily: "inherit" }} />
              )}
            </Flex>
          </Box>

          {/* Find button */}
          <button
            className="find-btn"
            onClick={fetchNearbyStops}
            disabled={!isReady || loadingStops}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: "14px",
              border: "none",
              fontWeight: "800",
              fontSize: "14px",
              cursor: !isReady || loadingStops ? "not-allowed" : "pointer",
              background: !isReady
                ? "#e2e8f0"
                : loadingStops
                ? "#94a3b8"
                : `linear-gradient(135deg, ${BLUE} 0%, ${PURPLE} 100%)`,
              color: !isReady ? MUTED : "#fff",
              boxShadow: isReady && !loadingStops ? `0 6px 24px ${BLUE}44` : "none",
              transition: "all 0.25s cubic-bezier(0.34,1.56,0.64,1)",
              letterSpacing: "0.01em",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            {loadingStops ? (
              <>
                <Box w="16px" h="16px" borderRadius="full"
                  style={{ border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", animation: "spinSlow 0.8s linear infinite" }} />
                Scanning transit…
              </>
            ) : (
              <>🔍 Find Nearby Transit</>
            )}
          </button>
        </Box>

        {/* ── Results area ── */}
        <Box px={5} py={4} flex={1}>

          {/* Empty / prompt state */}
          {!isReady && !loadingStops && !hasResults && (
            <Flex direction="column" align="center" textAlign="center" py={8} gap={3}
              style={{ animation: "slideUpFade 0.5s both" }}>
              <Box fontSize="3rem">🗺️</Box>
              <Text fontWeight="700" color={PRIMARY} fontSize="md">Enter your route</Text>
              <Text fontSize="sm" color={MUTED} lineHeight="1.6" maxW="220px">
                Type a pickup and destination above to discover transit stops along your route
              </Text>
              <Flex gap={2} mt={2} flexWrap="wrap" justify="center">
                {["Metro 🚇", "MMTS 🚂", "Bus 🚌"].map((t) => (
                  <Box key={t} px={3} py={1} borderRadius="full" bg={INPUT_BG}
                    style={{ border: `1px solid ${BORDER}`, fontSize: "12px", color: MUTED, fontWeight: "600" }}>
                    {t}
                  </Box>
                ))}
              </Flex>
            </Flex>
          )}

          {/* Ready but no results yet */}
          {isReady && !loadingStops && !hasResults && (
            <Flex direction="column" align="center" textAlign="center" py={6} gap={2}
              style={{ animation: "slideUpFade 0.4s both" }}>
              <Box fontSize="2rem">📍</Box>
              <Text fontWeight="700" color={PRIMARY} fontSize="sm">Route set</Text>
              <Text fontSize="xs" color={MUTED}>Click "Find Nearby Transit" to scan stops</Text>
            </Flex>
          )}

          {/* ── Legend (shown when route is loaded) ── */}
          {hasResults && (
            <Box mb={5} style={{ animation: "slideUpFade 0.4s both" }}>
              <Text fontSize="0.6rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={3}>
                Map Legend
              </Text>
              <Box
                p={4} borderRadius="16px"
                style={{ background: "linear-gradient(135deg,#f8faff,#f0f4ff)", border: `1px solid ${BORDER}` }}
              >
                <VStack gap={2.5} align="stretch">
                  <LegendRow color="#ef4444" label="Main route (driving)" />
                  <LegendRow color="#3b82f6" label="Walk to pickup-side stops" dashed />
                  <LegendRow color="#10b981" label="Walk to destination-side stops" dashed />
                  <Box h="1px" bg={BORDER} />
                  {Object.entries(STOP_CONFIG).map(([key, cfg]) => (
                    <Flex key={key} align="center" gap={2.5}>
                      <Box w="24px" h="24px" borderRadius="8px" display="flex" alignItems="center" justifyContent="center" fontSize="0.85rem"
                        style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
                        {cfg.emoji}
                      </Box>
                      <Text fontSize="xs" color={MUTED} fontWeight="600">{cfg.label} station</Text>
                    </Flex>
                  ))}
                  <Box h="1px" bg={BORDER} />
                  <Flex align="center" gap={2.5}>
                    <Box w="28px" h="5px" borderRadius="full" style={{ background: "linear-gradient(90deg, #22c55e, #f59e0b, #ef4444)" }} flexShrink={0} />
                    <Text fontSize="xs" color={MUTED} fontWeight="600">Traffic (low → heavy)</Text>
                  </Flex>
                </VStack>
              </Box>
            </Box>
          )}

          {/* ── Near Pickup ── */}
          {pickupStops.length > 0 && (
            <Box mb={5} style={{ animation: "slideUpFade 0.45s 0.05s both" }}>
              <SectionHeader emoji="📍" label="Near Pickup" color={BLUE} count={pickupStops.length} />
              <VStack gap={2.5} align="stretch">
                {pickupStops.map((stop, i) => (
                  <StopCard
                    key={`${stop.name}-${stop.lat}`}
                    stop={stop} index={i}
                    isSelected={selectedStop?.name === stop.name && selectedStop?.lat === stop.lat}
                    onClick={() => setSelectedStop(selectedStop?.name === stop.name && selectedStop?.lat === stop.lat ? null : stop)}
                  />
                ))}
              </VStack>
            </Box>
          )}

          {/* ── Near Destination ── */}
          {destinationStops.length > 0 && (
            <Box mb={5} style={{ animation: "slideUpFade 0.45s 0.1s both" }}>
              <SectionHeader emoji="🏁" label="Near Destination" color={GREEN} count={destinationStops.length} />
              <VStack gap={2.5} align="stretch">
                {destinationStops.map((stop, i) => (
                  <StopCard
                    key={`${stop.name}-${stop.lon}`}
                    stop={stop} index={i}
                    isSelected={selectedStop?.name === stop.name && selectedStop?.lon === stop.lon}
                    onClick={() => setSelectedStop(selectedStop?.name === stop.name && selectedStop?.lon === stop.lon ? null : stop)}
                  />
                ))}
              </VStack>
            </Box>
          )}

          {/* No stops found */}
          {isReady && !loadingStops && hasResults &&
           pickupStops.length === 0 && destinationStops.length === 0 && (
            <Flex direction="column" align="center" py={6} textAlign="center" gap={2}>
              <Text fontSize="2rem">😔</Text>
              <Text fontWeight="700" color={PRIMARY} fontSize="sm">No transit stops found</Text>
              <Text fontSize="xs" color={MUTED}>Try expanding the search radius or try a different location</Text>
            </Flex>
          )}
        </Box>
      </Box>

      {/* ═══════════════════════════════════════
          MAP PANEL
      ═══════════════════════════════════════ */}
      <Box flex={1} position="relative">
        {/* Loading overlay */}
        {loadingStops && (
          <Flex
            position="absolute" inset="0" zIndex={10}
            align="center" justify="center" pointerEvents="none"
            style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}
          >
            <Box
              px={6} py={4} borderRadius="20px" textAlign="center"
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.2)",
                backdropFilter: "blur(16px)",
                animation: "slideUpFade 0.3s both",
              }}
            >
              <Box fontSize="2rem" mb={2} style={{ animation: "spinSlow 1.5s linear infinite", display: "inline-block" }}>
                🔍
              </Box>
              <Text color="#fff" fontWeight="700" fontSize="md">Scanning transit stops…</Text>
              <Text color="rgba(255,255,255,0.55)" fontSize="sm" mt={1}>Finding metro, MMTS &amp; bus stops</Text>
            </Box>
          </Flex>
        )}

        {/* Map top overlay bar */}
        {hasResults && (
          <Box
            position="absolute" top={4} left="50%" zIndex={5}
            style={{ transform: "translateX(-50%)", animation: "slideUpFade 0.4s both", pointerEvents: "none" }}
          >
            <Flex
              align="center" gap={3} px={4} py={2} borderRadius="999px"
              style={{
                background: "rgba(15,23,42,0.82)",
                border: "1px solid rgba(255,255,255,0.15)",
                backdropFilter: "blur(12px)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
              }}
            >
              <Box w="7px" h="7px" borderRadius="full" bg={GREEN}
                style={{ animation: "pulseRing 2s ease-in-out infinite" }} />
              <Text color="rgba(255,255,255,0.9)" fontSize="sm" fontWeight="700">
                {allStops.length} transit stop{allStops.length !== 1 ? "s" : ""} found
              </Text>
              <Box w="1px" h="14px" bg="rgba(255,255,255,0.2)" />
              <Flex align="center" gap={1.5}>
                {Object.entries(STOP_CONFIG).map(([key, cfg]) => {
                  const cnt = allStops.filter((s) => s.stop_type === key).length
                  if (!cnt) return null
                  return (
                    <Flex key={key} align="center" gap={1} px={2} py={0.5} borderRadius="full"
                      style={{ background: `${cfg.color}25`, border: `1px solid ${cfg.color}40` }}>
                      <Text fontSize="0.7rem">{cfg.emoji}</Text>
                      <Text fontSize="0.68rem" fontWeight="700" style={{ color: "#fff" }}>{cnt}</Text>
                    </Flex>
                  )
                })}
              </Flex>
            </Flex>
          </Box>
        )}

        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "100%" }}
          center={{ lat: 17.385, lng: 78.4867 }}
          zoom={11}
          onLoad={(map) => { mapRef.current = map }}
          options={{
            styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
            disableDefaultUI: false,
            zoomControl: true,
            streetViewControl: false,
            fullscreenControl: true,
            mapTypeControl: false,
          }}
        >
          <TrafficLayer />

          {/* Origin marker + zone */}
          {origin && (
            <>
              <Marker position={origin}
                icon={{ url: pinMarkerUrl(BLUE, "📍"), scaledSize: new google.maps.Size(40, 52) }} />
              <Polygon paths={pickupPolygon}
                options={{ fillColor: BLUE, fillOpacity: 0.12, strokeColor: BLUE, strokeWeight: 2, strokeOpacity: 0.6 }} />
            </>
          )}

          {/* Destination marker + zone */}
          {destination && (
            <>
              <Marker position={destination}
                icon={{ url: pinMarkerUrl(GREEN, "🏁"), scaledSize: new google.maps.Size(40, 52) }} />
              <Polygon paths={destPolygon}
                options={{ fillColor: GREEN, fillOpacity: 0.12, strokeColor: GREEN, strokeWeight: 2, strokeOpacity: 0.6 }} />
            </>
          )}

          {/* Main route */}
          {directions && (
            <DirectionsRenderer directions={directions}
              options={{ polylineOptions: { strokeColor: "#ef4444", strokeWeight: 5, strokeOpacity: 0.85 }, suppressMarkers: true }} />
          )}

          {/* Pickup walking routes */}
          {pickupStopRoutes.map((route, i) => (
            <DirectionsRenderer key={`p-${i}`} directions={route}
              options={{ polylineOptions: { strokeColor: "#3b82f6", strokeWeight: 3, strokeOpacity: 0.75 }, suppressMarkers: true }} />
          ))}

          {/* Destination walking routes */}
          {destinationStopRoutes.map((route, i) => (
            <DirectionsRenderer key={`d-${i}`} directions={route}
              options={{ polylineOptions: { strokeColor: "#10b981", strokeWeight: 3, strokeOpacity: 0.75 }, suppressMarkers: true }} />
          ))}

          {/* Transit stop markers */}
          {allStops.map((stop) => (
            <Marker
              key={`${stop.name}-${stop.lat}-${stop.lon}`}
              position={{ lat: stop.lat, lng: stop.lon }}
              icon={{ url: stopMarkerUrl(stop.stop_type), scaledSize: new google.maps.Size(40, 40) }}
              onClick={() => setSelectedStop(selectedStop?.lat === stop.lat && selectedStop?.lon === stop.lon ? null : stop)}
            />
          ))}

          {/* Selected stop info window */}
          {selectedStop && (() => {
            const cfg = stopCfg(selectedStop.stop_type)
            return (
              <InfoWindow
                position={{ lat: selectedStop.lat, lng: selectedStop.lon }}
                onCloseClick={() => setSelectedStop(null)}
              >
                <Box p={2} minW="180px">
                  <Flex align="center" gap={2} mb={2}>
                    <Box w="36px" h="36px" borderRadius="10px" display="flex" alignItems="center" justifyContent="center" fontSize="1.2rem" flexShrink={0}
                      style={{ background: cfg.bg, border: `1.5px solid ${cfg.color}30` }}>
                      {cfg.emoji}
                    </Box>
                    <Box>
                      <Text fontWeight="800" fontSize="sm" color={PRIMARY}>{selectedStop.name}</Text>
                      <Box px={2} py={0.5} borderRadius="full" display="inline-block"
                        style={{ background: cfg.bg, border: `1px solid ${cfg.color}30`, fontSize: "0.6rem", fontWeight: "800", color: cfg.color }}>
                        {cfg.label}
                      </Box>
                    </Box>
                  </Flex>
                  <Flex align="center" gap={4}>
                    <Box textAlign="center">
                      <Text fontSize="lg" fontWeight="800" color={cfg.color}>{selectedStop.walk_min}</Text>
                      <Text fontSize="0.62rem" color={MUTED} fontWeight="600">min walk</Text>
                    </Box>
                    <Box w="1px" h="28px" bg={BORDER} />
                    <Box textAlign="center">
                      <Text fontSize="lg" fontWeight="800" color={PRIMARY}>{selectedStop.distance_m}</Text>
                      <Text fontSize="0.62rem" color={MUTED} fontWeight="600">metres</Text>
                    </Box>
                  </Flex>
                </Box>
              </InfoWindow>
            )
          })()}
        </GoogleMap>
      </Box>
    </Flex>
  )
}

// ── Animations ────────────────────────────────────────────────
const CSS_ANIMATIONS = `
  @keyframes gradientShift {
    0%   { background-position: 0%   50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0%   50%; }
  }
  @keyframes slideUpFade {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes floatIn {
    from { opacity: 0; transform: translateX(-14px) scale(0.96); }
    to   { opacity: 1; transform: translateX(0) scale(1); }
  }
  @keyframes pulseRing {
    0%   { box-shadow: 0 0 0 0   rgba(16,185,129,0.7); }
    70%  { box-shadow: 0 0 0 8px rgba(16,185,129,0);  }
    100% { box-shadow: 0 0 0 0   rgba(16,185,129,0);  }
  }
  @keyframes spinSlow {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  .stop-card:hover {
    transform: translateX(5px) scale(1.01) !important;
    box-shadow: 0 6px 24px rgba(0,0,0,0.1) !important;
  }

  .find-btn {
    position: relative; overflow: hidden;
    transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1),
                box-shadow 0.25s ease;
  }
  .find-btn:not(:disabled):hover {
    transform: translateY(-2px) scale(1.02);
  }
  .find-btn::before {
    content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
    transition: left 0.5s ease;
  }
  .find-btn:not(:disabled):hover::before { left: 100%; }

  .sidebar-scroll::-webkit-scrollbar { width: 4px; }
  .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
  .sidebar-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }
`
