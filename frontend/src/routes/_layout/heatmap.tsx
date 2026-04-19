import "leaflet/dist/leaflet.css"
import { useEffect, useRef, useState } from "react"
import { useQueries } from "@tanstack/react-query"
import {
  Badge,
  Box,
  Flex,
  Heading,
  Text,
  VStack,
} from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import L from "leaflet"
import { getOptimalPickup } from "@/lib/api"

export const Route = createFileRoute("/_layout/heatmap")({
  component: HeatmapPage,
})

// ─── Zone data ───────────────────────────────────────────────────────────────

interface Zone {
  name: string
  center: [number, number] // [lat, lon]
  baseCancelRate: number
  size: number // bounding box half-size in degrees
}

const ZONES: Zone[] = [
  { name: "Ameerpet", center: [17.4375, 78.4483], baseCancelRate: 0.62, size: 0.012 },
  { name: "Banjara Hills", center: [17.4100, 78.4383], baseCancelRate: 0.35, size: 0.013 },
  { name: "Madhapur", center: [17.4483, 78.3915], baseCancelRate: 0.45, size: 0.013 },
  { name: "Hitech City", center: [17.4500, 78.3800], baseCancelRate: 0.55, size: 0.012 },
  { name: "Gachibowli", center: [17.4399, 78.3489], baseCancelRate: 0.28, size: 0.013 },
  { name: "Secunderabad", center: [17.4400, 78.4983], baseCancelRate: 0.66, size: 0.013 },
  { name: "Begumpet", center: [17.4440, 78.4600], baseCancelRate: 0.50, size: 0.011 },
  { name: "Jubilee Hills", center: [17.4250, 78.4100], baseCancelRate: 0.32, size: 0.013 },
  { name: "Kondapur", center: [17.4600, 78.3650], baseCancelRate: 0.42, size: 0.013 },
  { name: "Kukatpally", center: [17.4933, 78.4133], baseCancelRate: 0.58, size: 0.013 },
  { name: "LB Nagar", center: [17.3483, 78.5533], baseCancelRate: 0.68, size: 0.011 },
  { name: "Dilsukhnagar", center: [17.3683, 78.5267], baseCancelRate: 0.60, size: 0.011 },
  { name: "Mehdipatnam", center: [17.3917, 78.4350], baseCancelRate: 0.52, size: 0.011 },
  { name: "Uppal", center: [17.3983, 78.5600], baseCancelRate: 0.50, size: 0.011 },
  { name: "Miyapur", center: [17.4967, 78.3483], baseCancelRate: 0.38, size: 0.013 },
]

// Zone centers used to query optimal pickup stops (5 key zones)
const KEY_ZONE_CENTERS = [
  { lat: 17.4483, lon: 78.3915 }, // Madhapur
  { lat: 17.4375, lon: 78.4483 }, // Ameerpet
  { lat: 17.4399, lon: 78.3489 }, // Gachibowli
  { lat: 17.4400, lon: 78.4983 }, // Secunderabad
  { lat: 17.4933, lon: 78.4133 }, // Kukatpally
]

// Time-of-day cancel rate multipliers
function getTimeMultiplier(hour: number): number {
  if (hour >= 7 && hour <= 10) return 1.25 // morning peak
  if (hour >= 17 && hour <= 21) return 1.18 // evening peak
  if (hour >= 22 || hour <= 5) return 0.7  // night off-peak
  return 1.0
}

// Day-of-week multipliers (0=Mon … 6=Sun)
function getDayMultiplier(day: number): number {
  if (day === 6) return 0.72   // Sunday — low demand
  if (day === 5) return 0.82   // Saturday — moderate
  if (day === 0 || day === 4) return 1.08  // Mon/Fri — slightly elevated
  return 1.0  // Tue–Thu normal
}

function getRateForHour(base: number, hour: number, day: number): number {
  return Math.min(0.95, base * getTimeMultiplier(hour) * getDayMultiplier(day))
}

function getZoneColor(cancelRate: number): string {
  if (cancelRate < 0.35) return "#48bb78" // green
  if (cancelRate < 0.60) return "#ed8936" // orange/yellow
  return "#e53e3e" // red
}

function getRiskLabel(cancelRate: number): string {
  if (cancelRate < 0.35) return "Low"
  if (cancelRate < 0.60) return "Moderate"
  return "High"
}

function getStopColor(stopType: string): string {
  if (stopType === "metro") return "#3182ce"
  if (stopType === "mmts") return "#805ad5"
  return "#ed8936"
}

// ─── Component ───────────────────────────────────────────────────────────────

function HeatmapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const zoneLayerRef = useRef<L.LayerGroup | null>(null)
  const stopLayerRef = useRef<L.LayerGroup | null>(null)

  const [selectedHour, setSelectedHour] = useState(9)
  const [selectedDay, setSelectedDay] = useState(1) // Mon
  const [showZones, setShowZones] = useState(true)
  const [showStops, setShowStops] = useState(true)
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null)

  // Query optimal pickup stops for 5 key zone centers
  const stopsQueries = useQueries({
    queries: KEY_ZONE_CENTERS.map((center) => ({
      queryKey: ["heatmap-stops", center.lat, center.lon],
      queryFn: () =>
        getOptimalPickup({
          origin_lat: center.lat,
          origin_lon: center.lon,
          radius_m: 2000,
        }),
      staleTime: 30 * 60 * 1000,
    })),
  })

  // Initialise map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [17.385, 78.4867],
      zoom: 12,
    })

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map)

    mapRef.current = map
    zoneLayerRef.current = L.layerGroup().addTo(map)
    stopLayerRef.current = L.layerGroup().addTo(map)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update zone polygons when hour/day/showZones changes
  useEffect(() => {
    if (!zoneLayerRef.current || !mapRef.current) return
    zoneLayerRef.current.clearLayers()
    if (!showZones) return

    ZONES.forEach((zone) => {
      const rate = getRateForHour(zone.baseCancelRate, selectedHour, selectedDay)
      const color = getZoneColor(rate)
      const [lat, lon] = zone.center
      const s = zone.size

      const polygon = L.polygon(
        [
          [lat - s, lon - s],
          [lat - s, lon + s],
          [lat + s, lon + s],
          [lat + s, lon - s],
        ],
        {
          color,
          fillColor: color,
          fillOpacity: 0.35,
          weight: 2,
        },
      )

      polygon.on("click", () => setSelectedZone(zone))
      polygon
        .bindTooltip(
          `<b>${zone.name}</b><br/>${getRiskLabel(rate)} risk · ${Math.round(rate * 100)}%`,
          { sticky: true },
        )
        .addTo(zoneLayerRef.current!)
    })
  }, [selectedHour, selectedDay, showZones])

  // Update stop markers when stop data / showStops changes
  useEffect(() => {
    if (!stopLayerRef.current || !mapRef.current) return
    stopLayerRef.current.clearLayers()
    if (!showStops) return

    stopsQueries.forEach((q, qi) => {
      if (!q.data) return
      const center = KEY_ZONE_CENTERS[qi]
      q.data.suggestions.forEach((stop) => {
        // Use actual coordinates from backend; fall back to offset approximation if missing
        const markerLat = stop.lat && stop.lat !== 0 ? stop.lat : center.lat + (stop.distance_m / 111000) * (qi % 2 === 0 ? 1 : -1)
        const markerLon = stop.lon && stop.lon !== 0 ? stop.lon : center.lon + (stop.distance_m / 111000) * (qi % 3 === 0 ? 1 : -0.5)

        const marker = L.circleMarker([markerLat, markerLon], {
          radius: 8,
          color: "#fff",
          weight: 2,
          fillColor: getStopColor(stop.stop_type),
          fillOpacity: 0.9,
        })

        marker.bindPopup(
          `<b>${stop.name}</b><br/>
          Type: ${stop.stop_type}<br/>
          Walk: ${stop.walk_min} min (${stop.distance_m}m)<br/>
          Risk reduction: ↓${stop.risk_reduction_pct}%`,
        )
        marker.addTo(stopLayerRef.current!)
      })
    })
  }, [stopsQueries, showStops])

  const selectedRate = selectedZone
    ? getRateForHour(selectedZone.baseCancelRate, selectedHour, selectedDay)
    : null

  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  return (
    <Flex h="calc(100vh - 80px)" overflow="hidden">
      {/* ── Controls Sidebar ── */}
      <Box
        w="260px"
        bg="bg.subtle"
        borderRightWidth="1px"
        p={4}
        overflowY="auto"
        flexShrink={0}
      >
        <VStack gap={5} align="stretch">
          <Heading size="sm">City Heatmap</Heading>
          <Text fontSize="xs" color="gray.500">
            Hyderabad cancellation risk by zone
          </Text>

          {/* Hour Slider */}
          <Box>
            <Text fontSize="xs" fontWeight="bold" color="gray.500" mb={2}>
              HOUR OF DAY
            </Text>
            <Text fontSize="2xl" fontWeight="bold" mb={1} textAlign="center">
              {String(selectedHour).padStart(2, "0")}:00
            </Text>
            <input
              type="range"
              min={0}
              max={23}
              value={selectedHour}
              onChange={(e) => setSelectedHour(Number(e.target.value))}
              style={{ width: "100%" }}
            />
            <Flex justify="space-between" fontSize="xs" color="gray.500">
              <Text>00:00</Text>
              <Text>23:00</Text>
            </Flex>
          </Box>

          {/* Day Selector */}
          <Box>
            <Text fontSize="xs" fontWeight="bold" color="gray.500" mb={2}>
              DAY
            </Text>
            <Flex gap={1} flexWrap="wrap">
              {DAY_NAMES.map((d, i) => (
                <Box
                  key={d}
                  px={2}
                  py={1}
                  fontSize="xs"
                  borderRadius="md"
                  cursor="pointer"
                  bg={selectedDay === i ? "blue.500" : "bg"}
                  color={selectedDay === i ? "white" : undefined}
                  borderWidth="1px"
                  onClick={() => setSelectedDay(i)}
                >
                  {d}
                </Box>
              ))}
            </Flex>
          </Box>

          {/* Layer Toggles */}
          <Box>
            <Text fontSize="xs" fontWeight="bold" color="gray.500" mb={2}>
              LAYERS
            </Text>
            <VStack gap={2} align="stretch">
              <Flex
                align="center"
                justify="space-between"
                p={2}
                borderRadius="md"
                bg="bg"
                cursor="pointer"
                onClick={() => setShowZones((v) => !v)}
              >
                <Text fontSize="sm">Zone Risk</Text>
                <Badge colorPalette={showZones ? "green" : "gray"}>
                  {showZones ? "ON" : "OFF"}
                </Badge>
              </Flex>
              <Flex
                align="center"
                justify="space-between"
                p={2}
                borderRadius="md"
                bg="bg"
                cursor="pointer"
                onClick={() => setShowStops((v) => !v)}
              >
                <Text fontSize="sm">Transit Stops</Text>
                <Badge colorPalette={showStops ? "green" : "gray"}>
                  {showStops ? "ON" : "OFF"}
                </Badge>
              </Flex>
            </VStack>
          </Box>

          {/* Legend */}
          <Box>
            <Text fontSize="xs" fontWeight="bold" color="gray.500" mb={2}>
              ZONE RISK LEGEND
            </Text>
            <VStack gap={1} align="stretch">
              {[
                { color: "#48bb78", label: "Low (<35%)" },
                { color: "#ed8936", label: "Moderate (35–60%)" },
                { color: "#e53e3e", label: "High (>60%)" },
              ].map((item) => (
                <Flex key={item.label} align="center" gap={2} fontSize="xs">
                  <Box
                    w="14px"
                    h="14px"
                    borderRadius="sm"
                    bg={item.color}
                    flexShrink={0}
                  />
                  <Text>{item.label}</Text>
                </Flex>
              ))}
            </VStack>
          </Box>

          <Box>
            <Text fontSize="xs" fontWeight="bold" color="gray.500" mb={2}>
              STOP LEGEND
            </Text>
            <VStack gap={1} align="stretch">
              {[
                { color: "#3182ce", label: "Metro" },
                { color: "#805ad5", label: "MMTS" },
                { color: "#ed8936", label: "Bus" },
              ].map((item) => (
                <Flex key={item.label} align="center" gap={2} fontSize="xs">
                  <Box
                    w="10px"
                    h="10px"
                    borderRadius="full"
                    bg={item.color}
                    flexShrink={0}
                  />
                  <Text>{item.label}</Text>
                </Flex>
              ))}
            </VStack>
          </Box>

          {/* Selected Zone Info */}
          {selectedZone && selectedRate !== null && (
            <Box borderWidth="1px" borderRadius="md" p={3} bg="bg">
              <Text fontSize="xs" fontWeight="bold" color="gray.500" mb={1}>
                SELECTED ZONE
              </Text>
              <Text fontWeight="bold">{selectedZone.name}</Text>
              <Flex align="center" gap={2} mt={1}>
                <Badge
                  colorPalette={
                    getRiskLabel(selectedRate) === "Low"
                      ? "green"
                      : getRiskLabel(selectedRate) === "Moderate"
                        ? "orange"
                        : "red"
                  }
                >
                  {getRiskLabel(selectedRate)}
                </Badge>
                <Text fontSize="sm">{Math.round(selectedRate * 100)}% cancel rate</Text>
              </Flex>
            </Box>
          )}
        </VStack>
      </Box>

      {/* ── Map ── */}
      <Box flex="1" ref={mapContainerRef} />
    </Flex>
  )
}
