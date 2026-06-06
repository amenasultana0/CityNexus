import { useState, useEffect, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Box,
  Container,
  Flex,
  Grid,
  Heading,
  Input,
  Text,
  VStack,
  Textarea,
} from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from "@react-google-maps/api"

export const Route = createFileRoute("/_layout/community")({
  component: CommunityPage,
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

// Hyderabad center
const HYD_CENTER = { lat: 17.385, lng: 78.4867 }

const CATEGORIES = [
  { id: "metro", label: "Metro Issue", emoji: "🚇", color: TEAL },
  { id: "auto", label: "Auto Strike", emoji: "🛺", color: AMBER },
  { id: "road", label: "Road Block", emoji: "🚧", color: RED },
  { id: "flooding", label: "Flooding", emoji: "🌊", color: BLUE },
  { id: "police", label: "Police Naaka", emoji: "👮", color: PURPLE },
  { id: "accident", label: "Accident", emoji: "🚨", color: RED },
  { id: "other", label: "Other", emoji: "⚠️", color: MUTED },
]

function getCategoryInfo(id: string) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]
}

function timeAgo(minutes: number): string {
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`
}

interface Disruption {
  id: number
  lat: number
  lon: number
  category: string
  description: string
  location_name: string | null
  reported_at: string
  upvotes: number
  is_active: boolean
  minutes_ago: number
}

interface DisruptionsResponse {
  disruptions: Disruption[]
  total: number
}

async function fetchDisruptions(lat: number, lon: number): Promise<DisruptionsResponse> {
  const res = await fetch(`/api/v1/community/disruptions?lat=${lat}&lon=${lon}&radius_km=15`)
  if (!res.ok) throw new Error("Failed to fetch disruptions")
  return res.json()
}

async function submitReport(data: {
  lat: number; lon: number; category: string;
  description: string; location_name?: string
}): Promise<Disruption> {
  const res = await fetch("/api/v1/community/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to submit report")
  return res.json()
}

async function upvoteReport(id: number): Promise<Disruption> {
  const res = await fetch(`/api/v1/community/disruptions/${id}/upvote`, { method: "POST" })
  if (!res.ok) throw new Error("Failed to upvote")
  return res.json()
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

function CommunityPage() {
  const qc = useQueryClient()
  const [mapCenter, setMapCenter] = useState(HYD_CENTER)
  const [selectedMarker, setSelectedMarker] = useState<Disruption | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formCategory, setFormCategory] = useState("road")
  const [formDesc, setFormDesc] = useState("")
  const [formLocation, setFormLocation] = useState("")
  const [formLat, setFormLat] = useState(HYD_CENTER.lat)
  const [formLon, setFormLon] = useState(HYD_CENTER.lng)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState("")
  const [upvotedIds, setUpvotedIds] = useState<Set<number>>(new Set())

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  })

  // Get user location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude
          const lon = pos.coords.longitude
          // Only use if within Hyderabad bounds
          if (lat >= 17.0 && lat <= 18.0 && lon >= 78.0 && lon <= 79.0) {
            setMapCenter({ lat, lng: lon })
            setFormLat(lat)
            setFormLon(lon)
          }
        },
        () => {} // silently fail
      )
    }
  }, [])

  const disruptionsQuery = useQuery({
    queryKey: ["disruptions", mapCenter.lat, mapCenter.lng],
    queryFn: () => fetchDisruptions(mapCenter.lat, mapCenter.lng),
    refetchInterval: 60000, // auto-refresh every 60s
  })

  const submitMutation = useMutation({
    mutationFn: submitReport,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["disruptions"] })
      setShowForm(false)
      setFormDesc("")
      setFormLocation("")
      setSubmitError("")
    },
    onError: () => setSubmitError("Failed to submit — please try again"),
  })

  const upvoteMutation = useMutation({
    mutationFn: upvoteReport,
    onSuccess: (updated) => {
      setUpvotedIds((prev) => new Set(prev).add(updated.id))
      qc.invalidateQueries({ queryKey: ["disruptions"] })
    },
  })

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return
    setFormLat(e.latLng.lat())
    setFormLon(e.latLng.lng())
  }, [])

  const handleSubmit = () => {
    if (!formDesc.trim()) {
      setSubmitError("Please describe the disruption")
      return
    }
    submitMutation.mutate({
      lat: formLat,
      lon: formLon,
      category: formCategory,
      description: formDesc.trim(),
      location_name: formLocation.trim() || undefined,
    })
  }

  const disruptions = disruptionsQuery.data?.disruptions ?? []
  const filtered = filterCategory ? disruptions.filter((d) => d.category === filterCategory) : disruptions

  // Stats
  const byCat: Record<string, number> = {}
  disruptions.forEach((d) => { byCat[d.category] = (byCat[d.category] ?? 0) + 1 })
  const topCategory = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]

  const markerIcon = (category: string, upvotes: number) => {
    const info = getCategoryInfo(category)
    const size = upvotes >= 5 ? 44 : upvotes >= 2 ? 36 : 28
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
          <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${info.color}" stroke="white" stroke-width="2"/>
          <text x="${size/2}" y="${size/2 + 5}" text-anchor="middle" font-size="${size * 0.45}" font-family="sans-serif">${info.emoji}</text>
        </svg>
      `)}`,
      scaledSize: { width: size, height: size } as google.maps.Size,
    }
  }

  return (
    <Box bg={PAGE_BG} minH="100vh">
      <Container maxW="full" p={6}>
        {/* Header */}
        <Flex align="center" justify="space-between" mb={6} flexWrap="wrap" gap={3}>
          <Box>
            <Heading size="xl" color={PRIMARY} mb={1} fontWeight="700">Commute Community</Heading>
            <Text color={MUTED} fontSize="sm">Live disruption feed · crowd-sourced by Hyderabad commuters</Text>
          </Box>
          <Button
            onClick={() => setShowForm(!showForm)}
            style={{
              background: showForm ? MUTED : RED,
              color: "#fff", fontWeight: "600",
              borderRadius: "10px", padding: "10px 20px",
            }}
          >
            {showForm ? "Cancel" : "⚠️ Report Disruption"}
          </Button>
        </Flex>

        <VStack gap={5} align="stretch">
          {/* ── Stats Row ── */}
          <Grid templateColumns={{ base: "1fr 1fr", md: "repeat(4, 1fr)" }} gap={4}>
            <Card topColor={RED}>
              <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>Live Reports</Text>
              <Text fontSize="2rem" fontWeight="700" color={RED} lineHeight="1">{disruptions.length}</Text>
              <Text fontSize="xs" color={SUBTLE}>within 15km</Text>
            </Card>
            <Card topColor={AMBER}>
              <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>Most Reported</Text>
              {topCategory ? (
                <>
                  <Text fontSize="1.4rem" lineHeight="1">{getCategoryInfo(topCategory[0]).emoji}</Text>
                  <Text fontSize="xs" color={SUBTLE} mt={1} textTransform="capitalize">{getCategoryInfo(topCategory[0]).label}</Text>
                </>
              ) : <Text color={MUTED} fontSize="sm">None yet</Text>}
            </Card>
            <Card topColor={BLUE}>
              <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>Auto-Expires</Text>
              <Text fontSize="1.4rem" fontWeight="700" color={BLUE} lineHeight="1">6h</Text>
              <Text fontSize="xs" color={SUBTLE}>reports auto-clear</Text>
            </Card>
            <Card topColor={GREEN}>
              <Text fontSize="0.65rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>Community</Text>
              <Text fontSize="1.4rem" fontWeight="700" color={GREEN} lineHeight="1">Live</Text>
              <Text fontSize="xs" color={SUBTLE}>refreshes every 60s</Text>
            </Card>
          </Grid>

          {/* ── Report Form ── */}
          {showForm && (
            <Card topColor={RED}>
              <CardLabel>Report a Disruption</CardLabel>
              <Text fontSize="xs" color={MUTED} mb={4}>
                📍 Click on the map below to set the exact location, or use your current location
              </Text>

              {/* Category picker */}
              <Flex gap={2} flexWrap="wrap" mb={4}>
                {CATEGORIES.map((cat) => (
                  <Box
                    key={cat.id}
                    as="button"
                    onClick={() => setFormCategory(cat.id)}
                    px={3} py={2} borderRadius="10px" cursor="pointer"
                    fontSize="sm" fontWeight="600"
                    style={{
                      background: formCategory === cat.id ? cat.color : INPUT_BG,
                      color: formCategory === cat.id ? "#fff" : MUTED,
                      border: `1.5px solid ${formCategory === cat.id ? cat.color : BORDER}`,
                      transition: "all 0.18s ease",
                    }}
                  >
                    {cat.emoji} {cat.label}
                  </Box>
                ))}
              </Flex>

              <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4} mb={4}>
                <Field label="LOCATION NAME (optional)">
                  <Input
                    placeholder="e.g. Ameerpet Metro Station"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    bg={INPUT_BG} borderColor={BORDER} borderRadius="8px" color={PRIMARY}
                  />
                </Field>
                <Field label="COORDINATES (click map to set)">
                  <Input
                    value={`${formLat.toFixed(4)}, ${formLon.toFixed(4)}`}
                    readOnly bg={INPUT_BG} borderColor={BORDER} borderRadius="8px" color={MUTED}
                  />
                </Field>
              </Grid>

              <Field label="DESCRIPTION" mb={4}>
                <Textarea
                  placeholder="Describe what's happening... (e.g. Metro lift broken at Ameerpet, use stairs)"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  bg={INPUT_BG} borderColor={BORDER} borderRadius="8px" color={PRIMARY}
                  rows={3} maxLength={200}
                />
              </Field>
              <Flex align="center" justify="space-between">
                <Text fontSize="xs" color={SUBTLE}>{formDesc.length}/200</Text>
                {submitError && <Text fontSize="xs" color={RED}>{submitError}</Text>}
                <Button
                  onClick={handleSubmit}
                  loading={submitMutation.isPending}
                  style={{ background: RED, color: "#fff", fontWeight: "600", borderRadius: "8px", padding: "10px 24px" }}
                >
                  Submit Report
                </Button>
              </Flex>
            </Card>
          )}

          {/* ── Map ── */}
          <Card p={0}>
            <Box p={4} borderBottom={`1px solid ${BORDER}`}>
              <Flex align="center" justify="space-between" flexWrap="wrap" gap={3}>
                <CardLabel>Live Disruption Map</CardLabel>
                {showForm && (
                  <Text fontSize="xs" color={BLUE} fontWeight="600">Click map to pin your report location</Text>
                )}
              </Flex>
              {/* Category filter */}
              <Flex gap={2} flexWrap="wrap" mt={2}>
                <Box
                  as="button"
                  onClick={() => setFilterCategory(null)}
                  px={3} py={1} borderRadius="full" fontSize="xs" fontWeight="600" cursor="pointer"
                  style={{
                    background: filterCategory === null ? PRIMARY : INPUT_BG,
                    color: filterCategory === null ? "#fff" : MUTED,
                    border: `1px solid ${filterCategory === null ? PRIMARY : BORDER}`,
                  }}
                >
                  All ({disruptions.length})
                </Box>
                {CATEGORIES.filter((c) => byCat[c.id]).map((cat) => (
                  <Box
                    key={cat.id}
                    as="button"
                    onClick={() => setFilterCategory(filterCategory === cat.id ? null : cat.id)}
                    px={3} py={1} borderRadius="full" fontSize="xs" fontWeight="600" cursor="pointer"
                    style={{
                      background: filterCategory === cat.id ? cat.color : INPUT_BG,
                      color: filterCategory === cat.id ? "#fff" : MUTED,
                      border: `1px solid ${filterCategory === cat.id ? cat.color : BORDER}`,
                    }}
                  >
                    {cat.emoji} {cat.label} ({byCat[cat.id]})
                  </Box>
                ))}
              </Flex>
            </Box>
            <Box borderRadius="0 0 16px 16px" overflow="hidden">
              {isLoaded ? (
                <GoogleMap
                  mapContainerStyle={{ width: "100%", height: "420px" }}
                  center={mapCenter}
                  zoom={12}
                  onClick={showForm ? handleMapClick : undefined}
                  options={{
                    styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
                    disableDefaultUI: false,
                    zoomControl: true,
                    streetViewControl: false,
                    fullscreenControl: true,
                  }}
                >
                  {/* Report pin when form is open */}
                  {showForm && (
                    <Marker
                      position={{ lat: formLat, lng: formLon }}
                      icon={{
                        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                          <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
                            <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 24 16 24s16-12 16-24C32 7.16 24.84 0 16 0z" fill="${RED}"/>
                            <circle cx="16" cy="16" r="8" fill="white"/>
                            <text x="16" y="20" text-anchor="middle" font-size="10" font-family="sans-serif">📍</text>
                          </svg>
                        `)}`,
                        scaledSize: new google.maps.Size(32, 40),
                      }}
                    />
                  )}

                  {/* Disruption markers */}
                  {filtered.map((d) => (
                    <Marker
                      key={d.id}
                      position={{ lat: d.lat, lng: d.lon }}
                      icon={markerIcon(d.category, d.upvotes)}
                      onClick={() => setSelectedMarker(d)}
                    />
                  ))}

                  {/* Info window */}
                  {selectedMarker && (
                    <InfoWindow
                      position={{ lat: selectedMarker.lat, lng: selectedMarker.lon }}
                      onCloseClick={() => setSelectedMarker(null)}
                    >
                      <Box p={2} maxW="220px">
                        <Flex align="center" gap={2} mb={1}>
                          <Text fontSize="lg">{getCategoryInfo(selectedMarker.category).emoji}</Text>
                          <Text fontWeight="700" fontSize="sm" color={PRIMARY}>{getCategoryInfo(selectedMarker.category).label}</Text>
                        </Flex>
                        {selectedMarker.location_name && (
                          <Text fontSize="xs" color={MUTED} mb={1}>📍 {selectedMarker.location_name}</Text>
                        )}
                        <Text fontSize="sm" color={PRIMARY} mb={2}>{selectedMarker.description}</Text>
                        <Flex align="center" justify="space-between">
                          <Text fontSize="xs" color={SUBTLE}>{timeAgo(selectedMarker.minutes_ago)}</Text>
                          <Flex align="center" gap={1}>
                            <Text fontSize="xs" color={MUTED}>👍 {selectedMarker.upvotes}</Text>
                          </Flex>
                        </Flex>
                      </Box>
                    </InfoWindow>
                  )}
                </GoogleMap>
              ) : (
                <Skeleton h="420px" />
              )}
            </Box>
          </Card>

          {/* ── Live Feed ── */}
          <Card>
            <Flex align="center" justify="space-between" mb={4}>
              <CardLabel>Live Feed</CardLabel>
              <Flex align="center" gap={2}>
                <Box w="8px" h="8px" borderRadius="full" bg={GREEN} style={{ animation: "pulse 2s infinite" }} />
                <Text fontSize="xs" color={MUTED}>auto-refreshing</Text>
              </Flex>
            </Flex>

            {disruptionsQuery.isLoading ? (
              <VStack gap={3}>
                <Skeleton h="80px" borderRadius="12px" />
                <Skeleton h="80px" borderRadius="12px" />
                <Skeleton h="80px" borderRadius="12px" />
              </VStack>
            ) : filtered.length === 0 ? (
              <Flex direction="column" align="center" py={10} textAlign="center">
                <Text fontSize="3rem" mb={3}>🙌</Text>
                <Text fontWeight="700" color={PRIMARY} mb={1}>All clear!</Text>
                <Text fontSize="sm" color={MUTED}>No disruptions reported near you. Be the first to report if you spot something.</Text>
              </Flex>
            ) : (
              <VStack gap={3} align="stretch">
                {filtered.map((d) => {
                  const cat = getCategoryInfo(d.category)
                  const alreadyUpvoted = upvotedIds.has(d.id)
                  return (
                    <Box
                      key={d.id}
                      p={4} borderRadius="12px"
                      border={`1px solid ${BORDER}`}
                      bg={INPUT_BG}
                      _hover={{ bg: "#f1f5f9" }}
                      transition="background 0.15s"
                    >
                      <Flex align="flex-start" gap={3}>
                        {/* Category icon */}
                        <Flex
                          w="44px" h="44px" borderRadius="12px" flexShrink={0}
                          align="center" justify="center" fontSize="1.4rem"
                          style={{ background: `${cat.color}18`, border: `1.5px solid ${cat.color}30` }}
                        >
                          {cat.emoji}
                        </Flex>

                        {/* Content */}
                        <Box flex={1}>
                          <Flex align="center" gap={2} mb={1} flexWrap="wrap">
                            <Box
                              px={2} py={0.5} borderRadius="full" fontSize="0.65rem" fontWeight="700"
                              style={{ background: `${cat.color}18`, color: cat.color }}
                            >
                              {cat.label}
                            </Box>
                            {d.upvotes >= 3 && (
                              <Box px={2} py={0.5} borderRadius="full" bg="#fef3c7" color="#92400e" fontSize="0.65rem" fontWeight="700">
                                🔥 Trending
                              </Box>
                            )}
                            {d.minutes_ago < 10 && (
                              <Box px={2} py={0.5} borderRadius="full" bg="#dcfce7" color="#16a34a" fontSize="0.65rem" fontWeight="700">
                                🆕 New
                              </Box>
                            )}
                          </Flex>
                          {d.location_name && (
                            <Text fontSize="xs" color={MUTED} mb={0.5}>📍 {d.location_name}</Text>
                          )}
                          <Text fontSize="sm" color={PRIMARY} mb={2}>{d.description}</Text>
                          <Flex align="center" justify="space-between">
                            <Text fontSize="xs" color={SUBTLE}>{timeAgo(d.minutes_ago)}</Text>
                            <Box
                              as="button"
                              onClick={() => !alreadyUpvoted && upvoteMutation.mutate(d.id)}
                              px={3} py={1} borderRadius="full" cursor={alreadyUpvoted ? "default" : "pointer"}
                              fontSize="xs" fontWeight="600"
                              style={{
                                background: alreadyUpvoted ? "#dcfce7" : INPUT_BG,
                                color: alreadyUpvoted ? "#16a34a" : MUTED,
                                border: `1px solid ${alreadyUpvoted ? "#16a34a" : BORDER}`,
                                transition: "all 0.18s ease",
                              }}
                            >
                              👍 {d.upvotes} {alreadyUpvoted ? "· Thanks!" : "· Confirm"}
                            </Box>
                          </Flex>
                        </Box>
                      </Flex>
                    </Box>
                  )
                })}
              </VStack>
            )}
          </Card>
        </VStack>
      </Container>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </Box>
  )
}