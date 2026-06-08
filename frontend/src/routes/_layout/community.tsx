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
import { Skeleton } from "@/components/ui/skeleton"
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from "@react-google-maps/api"

export const Route = createFileRoute("/_layout/community")({
  component: CommunityPage,
})

const LIBRARIES: ("places")[] = ["places"]

const PRIMARY  = "#1a202c"
const MUTED    = "#718096"
const SUBTLE   = "#a0aec0"
const INPUT_BG = "#f7fafc"
const BORDER   = "#e2e8f0"
const CARD     = "#ffffff"
const BLUE     = "#1a56db"
const TEAL     = "#0694a2"
const GREEN    = "#10b981"
const AMBER    = "#f59e0b"
const RED      = "#ef4444"
const PURPLE   = "#7c3aed"
const PAGE_BG  = "#f0f4f8"

const HYD_CENTER = { lat: 17.385, lng: 78.4867 }

const CATEGORIES = [
  { id: "metro",    label: "Metro Issue",   emoji: "🚇", color: TEAL },
  { id: "auto",     label: "Auto Strike",   emoji: "🛺", color: AMBER },
  { id: "road",     label: "Road Block",    emoji: "🚧", color: RED },
  { id: "flooding", label: "Flooding",      emoji: "🌊", color: BLUE },
  { id: "police",   label: "Police Naaka",  emoji: "👮", color: PURPLE },
  { id: "accident", label: "Accident",      emoji: "🚨", color: "#dc2626" },
  { id: "other",    label: "Other",         emoji: "⚠️", color: MUTED },
]

const CAT_GRADIENT: Record<string, string> = {
  metro:    "linear-gradient(135deg,rgba(6,148,162,0.09),rgba(6,148,162,0.02))",
  auto:     "linear-gradient(135deg,rgba(245,158,11,0.09),rgba(245,158,11,0.02))",
  road:     "linear-gradient(135deg,rgba(239,68,68,0.09),rgba(239,68,68,0.02))",
  flooding: "linear-gradient(135deg,rgba(26,86,219,0.09),rgba(26,86,219,0.02))",
  police:   "linear-gradient(135deg,rgba(124,58,237,0.09),rgba(124,58,237,0.02))",
  accident: "linear-gradient(135deg,rgba(220,38,38,0.09),rgba(220,38,38,0.02))",
  other:    "linear-gradient(135deg,rgba(113,128,150,0.07),rgba(113,128,150,0.01))",
}

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
  if (!res.ok) throw new Error("Failed")
  return res.json()
}

async function submitReport(data: {
  lat: number; lon: number; category: string
  description: string; location_name?: string
}): Promise<Disruption> {
  const res = await fetch("/api/v1/community/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed")
  return res.json()
}

async function upvoteReport(id: number): Promise<Disruption> {
  const res = await fetch(`/api/v1/community/disruptions/${id}/upvote`, { method: "POST" })
  if (!res.ok) throw new Error("Failed")
  return res.json()
}

async function resolveReport(id: number): Promise<void> {
  await fetch(`/api/v1/community/disruptions/${id}/resolve`, { method: "POST" })
}

function CommunityPage() {
  const qc = useQueryClient()
  const [mapCenter, setMapCenter]         = useState(HYD_CENTER)
  const [selectedMarker, setSelectedMarker] = useState<Disruption | null>(null)
  const [showForm, setShowForm]           = useState(false)
  const [formCategory, setFormCategory]   = useState("road")
  const [formDesc, setFormDesc]           = useState("")
  const [formLocation, setFormLocation]   = useState("")
  const [formLat, setFormLat]             = useState(HYD_CENTER.lat)
  const [formLon, setFormLon]             = useState(HYD_CENTER.lng)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [submitError, setSubmitError]     = useState("")
  const [upvotedIds, setUpvotedIds]       = useState<Set<number>>(new Set())

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  })

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: lat, longitude: lon } = pos.coords
      if (lat >= 17.0 && lat <= 18.0 && lon >= 78.0 && lon <= 79.0) {
        setMapCenter({ lat, lng: lon })
        setFormLat(lat)
        setFormLon(lon)
      }
    }, () => {})
  }, [])

  const disruptionsQuery = useQuery({
    queryKey: ["disruptions", mapCenter.lat, mapCenter.lng],
    queryFn: () => fetchDisruptions(mapCenter.lat, mapCenter.lng),
    refetchInterval: 60000,
  })

  const submitMutation = useMutation({
    mutationFn: submitReport,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["disruptions"] })
      setShowForm(false); setFormDesc(""); setFormLocation(""); setSubmitError("")
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

  const resolveMutation = useMutation({
    mutationFn: resolveReport,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["disruptions"] }),
  })

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return
    setFormLat(e.latLng.lat())
    setFormLon(e.latLng.lng())
  }, [])

  const handleSubmit = () => {
    if (!formDesc.trim()) { setSubmitError("Please describe the disruption"); return }
    submitMutation.mutate({
      lat: formLat, lon: formLon, category: formCategory,
      description: formDesc.trim(), location_name: formLocation.trim() || undefined,
    })
  }

  const disruptions = disruptionsQuery.data?.disruptions ?? []
  const filtered = filterCategory ? disruptions.filter((d) => d.category === filterCategory) : disruptions
  const byCat: Record<string, number> = {}
  disruptions.forEach((d) => { byCat[d.category] = (byCat[d.category] ?? 0) + 1 })
  const topCategory = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]

  const markerIcon = (category: string, upvotes: number) => {
    const info = getCategoryInfo(category)
    const size = upvotes >= 5 ? 44 : upvotes >= 2 ? 36 : 28
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
        `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
          <circle cx="${size/2}" cy="${size/2}" r="${size/2-2}" fill="${info.color}" stroke="white" stroke-width="2"/>
          <text x="${size/2}" y="${size/2+5}" text-anchor="middle" font-size="${size*0.45}" font-family="sans-serif">${info.emoji}</text>
        </svg>`
      )}`,
      scaledSize: { width: size, height: size } as google.maps.Size,
    }
  }

  return (
    <Box bg={PAGE_BG} minH="100vh">

      {/* ── Global animations ── */}
      <style>{`
        @keyframes gradientShift {
          0%   { background-position: 0%   50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0%   50%; }
        }
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatIn {
          from { opacity: 0; transform: translateX(-18px) scale(0.96); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes pulseRing {
          0%   { box-shadow: 0 0 0 0   rgba(16,185,129,0.7); }
          70%  { box-shadow: 0 0 0 10px rgba(16,185,129,0);  }
          100% { box-shadow: 0 0 0 0   rgba(16,185,129,0);   }
        }
        @keyframes pulseRingRed {
          0%   { box-shadow: 0 0 0 0   rgba(239,68,68,0.6); }
          70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0);   }
          100% { box-shadow: 0 0 0 0   rgba(239,68,68,0);   }
        }
        @keyframes firePulse {
          0%,100% { transform: scale(1) rotate(-4deg); }
          50%     { transform: scale(1.25) rotate(4deg); }
        }
        @keyframes orbFloat {
          0%,100% { transform: translateY(0)   scale(1);    }
          50%     { transform: translateY(-18px) scale(1.06); }
        }
        @keyframes spinSlow {
          from { transform: rotate(0deg);   }
          to   { transform: rotate(360deg); }
        }
        @keyframes upvotePop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.4) rotate(-8deg); }
          70%  { transform: scale(0.88); }
          100% { transform: scale(1); }
        }
        @keyframes newBadgePop {
          0%   { transform: scale(0); opacity: 0; }
          65%  { transform: scale(1.12); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes shimmerSlide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes countFadeUp {
          from { opacity:0; transform: translateY(8px); }
          to   { opacity:1; transform: translateY(0); }
        }
        @keyframes borderGlow {
          0%,100% { border-color: rgba(124,58,237,0.3); }
          50%     { border-color: rgba(124,58,237,0.8); box-shadow: 0 0 20px rgba(124,58,237,0.3); }
        }

        .community-report-card {
          transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1),
                      box-shadow 0.22s ease;
        }
        .community-report-card:hover {
          transform: translateX(6px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.1) !important;
        }
        .upvote-btn { transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1); }
        .upvote-btn:hover { transform: scale(1.08); }
        .upvote-btn:active { animation: upvotePop 0.38s ease; }

        .cat-pill { transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1); }
        .cat-pill:hover { transform: translateY(-2px) scale(1.04); }

        .hero-stat-glass {
          transition: transform 0.28s cubic-bezier(0.34,1.56,0.64,1),
                      box-shadow 0.28s ease;
        }
        .hero-stat-glass:hover {
          transform: translateY(-4px) scale(1.02);
          box-shadow: 0 16px 48px rgba(0,0,0,0.25) !important;
        }

        .report-btn-fancy {
          position: relative; overflow: hidden;
          transition: all 0.28s cubic-bezier(0.34,1.56,0.64,1);
        }
        .report-btn-fancy::before {
          content:''; position:absolute; top:0; left:-100%; width:100%; height:100%;
          background: linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent);
          transition: left 0.5s ease;
        }
        .report-btn-fancy:hover::before { left:100%; }
        .report-btn-fancy:hover { transform: translateY(-3px) scale(1.03); }

        .feed-scroll::-webkit-scrollbar { width: 4px; }
        .feed-scroll::-webkit-scrollbar-track { background: transparent; }
        .feed-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }

        .fire-emoji { display: inline-block; animation: firePulse 1.4s ease-in-out infinite; }
        .new-badge  { animation: newBadgePop 0.45s cubic-bezier(0.34,1.56,0.64,1) both; }
      `}</style>

      {/* ══════════════════════════════════════════════
          CINEMATIC HERO HEADER
      ══════════════════════════════════════════════ */}
      <Box
        position="relative" overflow="hidden"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 30%, #0c4a6e 65%, #134e4a 100%)",
          backgroundSize: "300% 300%",
          animation: "gradientShift 10s ease infinite",
        }}
        px={6} pt={10} pb={10}
      >
        {/* Grid texture */}
        <Box position="absolute" inset="0" pointerEvents="none" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
        }} />

        {/* Floating orbs */}
        <Box position="absolute" top="-40%" left="8%" w="400px" h="400px" borderRadius="full" pointerEvents="none"
          style={{ background: "radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)", animation: "orbFloat 7s ease-in-out infinite" }} />
        <Box position="absolute" bottom="-30%" right="4%" w="320px" h="320px" borderRadius="full" pointerEvents="none"
          style={{ background: "radial-gradient(circle, rgba(6,148,162,0.22) 0%, transparent 70%)", animation: "orbFloat 9s ease-in-out infinite 2s" }} />
        <Box position="absolute" top="20%" right="22%" w="200px" h="200px" borderRadius="full" pointerEvents="none"
          style={{ background: "radial-gradient(circle, rgba(245,158,11,0.14) 0%, transparent 70%)", animation: "orbFloat 6s ease-in-out infinite 1s" }} />

        <Container maxW="full" position="relative" zIndex={1}>
          <Flex align="flex-start" justify="space-between" mb={8} flexWrap="wrap" gap={5}>
            <Box style={{ animation: "slideUpFade 0.5s both" }}>
              {/* Live pulse badge */}
              <Flex align="center" gap={2} mb={3}>
                <Box w="9px" h="9px" borderRadius="full" bg="#10b981"
                  style={{ animation: "pulseRing 2s ease-in-out infinite" }} />
                <Text fontSize="0.62rem" color="rgba(255,255,255,0.55)" fontWeight="700" letterSpacing="2.5px" textTransform="uppercase">
                  HydAlert · Live Feed
                </Text>
              </Flex>

              {/* Gradient title */}
              <Heading
                fontWeight="900" lineHeight="1.0" mb={3}
                fontSize={{ base: "2.8rem", md: "4rem" }}
                style={{
                  background: "linear-gradient(135deg, #ffffff 0%, #a5f3fc 35%, #c4b5fd 65%, #fde68a 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  backgroundSize: "200% 200%",
                  animation: "gradientShift 6s ease infinite",
                }}
              >
                Hyderabad<br />Alert
              </Heading>
              <Text color="rgba(255,255,255,0.5)" fontSize="md" maxW="420px" lineHeight="1.65">
                Live disruption alerts from Hyderabad commuters — report road blocks, metro issues, flooding and more in real-time.
              </Text>
            </Box>

            {/* Report button */}
            <Box style={{ animation: "slideUpFade 0.5s 0.15s both" }}>
              <button
                className="report-btn-fancy"
                onClick={() => setShowForm(!showForm)}
                style={{
                  padding: "15px 30px",
                  borderRadius: "18px",
                  border: showForm ? "1.5px solid rgba(255,255,255,0.2)" : "none",
                  fontWeight: "800",
                  fontSize: "15px",
                  cursor: "pointer",
                  background: showForm
                    ? "rgba(255,255,255,0.1)"
                    : "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                  color: "#fff",
                  backdropFilter: showForm ? "blur(12px)" : undefined,
                  boxShadow: showForm
                    ? "0 4px 20px rgba(0,0,0,0.2)"
                    : "0 8px 36px rgba(239,68,68,0.55), 0 2px 8px rgba(0,0,0,0.3)",
                  letterSpacing: "0.01em",
                }}
              >
                {showForm ? "✕  Cancel" : "⚠️  Report Disruption"}
              </button>
            </Box>
          </Flex>

          {/* ── Glassmorphism stat cards ── */}
          <Grid templateColumns={{ base: "1fr 1fr", md: "repeat(3,1fr)" }} gap={4}>
            {[
              {
                label: "Live Reports",
                value: disruptions.length.toString(),
                unit: "within 15 km radius",
                accent: "#f87171",
                icon: "🚨",
                delay: "0s",
              },
              {
                label: "Most Reported",
                value: topCategory ? getCategoryInfo(topCategory[0]).emoji : "—",
                unit: topCategory ? getCategoryInfo(topCategory[0]).label : "No reports yet",
                accent: "#fbbf24",
                icon: null,
                delay: "0.08s",
              },
              {
                label: "Feed Status",
                value: "LIVE",
                unit: "Refreshes every 60s",
                accent: "#34d399",
                icon: null,
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
                <Text
                  fontWeight="900" lineHeight="1" mb={1}
                  fontSize={stat.value.length > 4 ? "1.8rem" : "2.4rem"}
                  style={{ color: stat.accent, animation: "countFadeUp 0.6s both" }}
                >
                  {stat.value}
                </Text>
                <Text fontSize="0.7rem" color="rgba(255,255,255,0.38)" fontWeight="600">{stat.unit}</Text>
                {i === 3 && (
                  <Flex align="center" gap={1.5} mt={2}>
                    <Box w="6px" h="6px" borderRadius="full" bg="#34d399"
                      style={{ animation: "pulseRing 2s ease-in-out infinite" }} />
                    <Text fontSize="0.62rem" color="#34d399" fontWeight="700">Active now</Text>
                  </Flex>
                )}
              </Box>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ══════════════════════════════════════════════
          MAIN BODY
      ══════════════════════════════════════════════ */}
      <Container maxW="full" px={6} py={7}>
        <VStack gap={7} align="stretch">

          {/* ── Category filter pills ── */}
          <Box style={{ animation: "slideUpFade 0.5s 0.1s both" }}>
            <Text fontSize="0.6rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={3}>
              Filter by Category
            </Text>
            <Flex gap={2} flexWrap="wrap">
              {/* All */}
              <button
                className="cat-pill"
                onClick={() => setFilterCategory(null)}
                style={{
                  padding: "9px 22px",
                  borderRadius: "999px",
                  border: `1.5px solid ${filterCategory === null ? "transparent" : BORDER}`,
                  fontWeight: "700",
                  fontSize: "13px",
                  cursor: "pointer",
                  background: filterCategory === null
                    ? "linear-gradient(135deg, #1a202c, #2d3748)"
                    : CARD,
                  color: filterCategory === null ? "#fff" : MUTED,
                  boxShadow: filterCategory === null
                    ? "0 4px 18px rgba(26,32,44,0.35)"
                    : "0 2px 6px rgba(0,0,0,0.04)",
                  transform: filterCategory === null ? "scale(1.06)" : "scale(1)",
                }}
              >
                ✦ All &nbsp;<span style={{ opacity: 0.7 }}>{disruptions.length}</span>
              </button>

              {CATEGORIES.filter((c) => byCat[c.id]).map((cat) => {
                const active = filterCategory === cat.id
                return (
                  <button
                    key={cat.id}
                    className="cat-pill"
                    onClick={() => setFilterCategory(active ? null : cat.id)}
                    style={{
                      padding: "9px 20px",
                      borderRadius: "999px",
                      border: `1.5px solid ${active ? "transparent" : BORDER}`,
                      fontWeight: "700",
                      fontSize: "13px",
                      cursor: "pointer",
                      background: active
                        ? `linear-gradient(135deg, ${cat.color}, ${cat.color}cc)`
                        : CARD,
                      color: active ? "#fff" : MUTED,
                      boxShadow: active
                        ? `0 4px 18px ${cat.color}55`
                        : "0 2px 6px rgba(0,0,0,0.04)",
                      transform: active ? "scale(1.06)" : "scale(1)",
                    }}
                  >
                    {cat.emoji} {cat.label}&nbsp;
                    <span style={{
                      background: active ? "rgba(255,255,255,0.25)" : "#f1f5f9",
                      color: active ? "#fff" : MUTED,
                      borderRadius: "999px",
                      padding: "1px 7px",
                      fontSize: "11px",
                    }}>
                      {byCat[cat.id]}
                    </span>
                  </button>
                )
              })}
            </Flex>
          </Box>

          {/* ── Report Form (slide-down) ── */}
          {showForm && (
            <Box
              style={{
                animation: "slideUpFade 0.42s cubic-bezier(0.22,1,0.36,1) both",
                background: "linear-gradient(135deg, rgba(239,68,68,0.05) 0%, rgba(255,255,255,0.95) 100%)",
                border: "1.5px solid rgba(239,68,68,0.25)",
                borderRadius: "28px",
                padding: "32px 28px",
                boxShadow: "0 12px 48px rgba(239,68,68,0.12), 0 2px 12px rgba(0,0,0,0.06)",
                backdropFilter: "blur(8px)",
              }}
            >
              {/* Form header */}
              <Flex align="center" gap={4} mb={7}>
                <Box
                  w="56px" h="56px" borderRadius="18px" flexShrink={0}
                  display="flex" alignItems="center" justifyContent="center" fontSize="1.7rem"
                  style={{
                    background: "linear-gradient(135deg, #fee2e2, #fecaca)",
                    boxShadow: "0 6px 20px rgba(239,68,68,0.3)",
                    animation: "pulseRingRed 2.5s ease-in-out infinite",
                  }}
                >
                  ⚠️
                </Box>
                <Box>
                  <Heading size="md" color={PRIMARY} fontWeight="800" mb={0.5}>Report a Disruption</Heading>
                  <Text fontSize="sm" color={MUTED}>📍 Click on the map below to pin the exact location</Text>
                </Box>
              </Flex>

              {/* Category picker */}
              <Text fontSize="0.6rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={3}>
                Category
              </Text>
              <Flex gap={2} flexWrap="wrap" mb={7}>
                {CATEGORIES.map((cat) => {
                  const active = formCategory === cat.id
                  return (
                    <button
                      key={cat.id}
                      className="cat-pill"
                      onClick={() => setFormCategory(cat.id)}
                      style={{
                        padding: "11px 18px",
                        borderRadius: "14px",
                        border: `1.5px solid ${active ? cat.color : BORDER}`,
                        fontWeight: "700",
                        fontSize: "13px",
                        cursor: "pointer",
                        background: active
                          ? `linear-gradient(135deg, ${cat.color}, ${cat.color}bb)`
                          : INPUT_BG,
                        color: active ? "#fff" : MUTED,
                        boxShadow: active ? `0 4px 18px ${cat.color}44` : "none",
                        transform: active ? "scale(1.05)" : "scale(1)",
                      }}
                    >
                      {cat.emoji} {cat.label}
                    </button>
                  )
                })}
              </Flex>

              {/* Fields */}
              <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={5} mb={6}>
                <Box>
                  <Text fontSize="0.6rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>
                    Location Name (optional)
                  </Text>
                  <Input
                    placeholder="e.g. Ameerpet Metro Station"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    bg={CARD} borderColor={BORDER} borderRadius="12px" color={PRIMARY}
                  />
                </Box>
                <Box>
                  <Text fontSize="0.6rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>
                    Coordinates (click map to set)
                  </Text>
                  <Input
                    value={`${formLat.toFixed(4)}, ${formLon.toFixed(4)}`}
                    readOnly bg={INPUT_BG} borderColor={BORDER} borderRadius="12px" color={MUTED}
                  />
                </Box>
              </Grid>

              <Box mb={6}>
                <Text fontSize="0.6rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>
                  Description
                </Text>
                <Textarea
                  placeholder="Describe what's happening... e.g. Metro lift broken at Ameerpet, use stairs"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  bg={CARD} borderColor={BORDER} borderRadius="12px" color={PRIMARY}
                  rows={3} maxLength={200}
                />
              </Box>

              <Flex align="center" justify="space-between" flexWrap="wrap" gap={3}>
                <Text fontSize="xs" color={SUBTLE}>{formDesc.length}/200</Text>
                <Flex align="center" gap={3}>
                  {submitError && (
                    <Text fontSize="xs" color={RED} fontWeight="600">{submitError}</Text>
                  )}
                  <button
                    className="report-btn-fancy"
                    onClick={handleSubmit}
                    disabled={submitMutation.isPending}
                    style={{
                      padding: "13px 30px",
                      borderRadius: "14px",
                      border: "none",
                      fontWeight: "800",
                      fontSize: "14px",
                      cursor: submitMutation.isPending ? "not-allowed" : "pointer",
                      background: submitMutation.isPending
                        ? "#94a3b8"
                        : "linear-gradient(135deg, #ef4444, #b91c1c)",
                      color: "#fff",
                      boxShadow: submitMutation.isPending
                        ? "none"
                        : "0 6px 24px rgba(239,68,68,0.45)",
                    }}
                  >
                    {submitMutation.isPending ? "Submitting…" : "Submit Report →"}
                  </button>
                </Flex>
              </Flex>
            </Box>
          )}

          {/* ── Map + Feed two-column ── */}
          <Grid templateColumns={{ base: "1fr", xl: "1fr 1fr" }} gap={7} alignItems="start">

            {/* ══ MAP PANEL ══ */}
            <Box
              borderRadius="28px" overflow="hidden"
              style={{
                boxShadow: "0 12px 48px rgba(0,0,0,0.14)",
                border: "1px solid rgba(226,232,240,0.6)",
                animation: "slideUpFade 0.55s 0.2s both",
              }}
            >
              {/* Map header */}
              <Box
                px={6} py={5}
                style={{
                  background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #0c4a6e 100%)",
                  backgroundSize: "200% 200%",
                  animation: "gradientShift 8s ease infinite",
                  borderBottom: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <Flex align="center" justify="space-between" mb={showForm ? 3 : 0}>
                  <Box>
                    <Text fontSize="0.6rem" color="rgba(255,255,255,0.45)" fontWeight="700" letterSpacing="1.8px" textTransform="uppercase" mb={0.5}>
                      Live Disruption Map
                    </Text>
                    <Heading size="sm" color="#fff" fontWeight="800">Hyderabad · 15 km radius</Heading>
                  </Box>
                  <Flex align="center" gap={2} px={3} py={1.5} borderRadius="full"
                    style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}>
                    <Box w="7px" h="7px" borderRadius="full" bg="#10b981"
                      style={{ animation: "pulseRing 2s ease-in-out infinite" }} />
                    <Text fontSize="xs" color="#6ee7b7" fontWeight="700">Live</Text>
                  </Flex>
                </Flex>
                {showForm && (
                  <Box px={4} py={2.5} borderRadius="12px"
                    style={{ background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.35)" }}>
                    <Text fontSize="xs" color="#fca5a5" fontWeight="600">
                      📍 Click anywhere on the map to pin your report location
                    </Text>
                  </Box>
                )}
              </Box>

              {/* Map itself */}
              {isLoaded ? (
                <GoogleMap
                  mapContainerStyle={{ width: "100%", height: "480px" }}
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
                  {/* Form pin */}
                  {showForm && (
                    <Marker
                      position={{ lat: formLat, lng: formLon }}
                      icon={{
                        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
                          `<svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 28 18 28s18-14.5 18-28C36 8.06 27.94 0 18 0z" fill="#ef4444"/>
                            <circle cx="18" cy="18" r="10" fill="white"/>
                            <text x="18" y="23" text-anchor="middle" font-size="12" font-family="sans-serif">📍</text>
                          </svg>`
                        )}`,
                        scaledSize: new google.maps.Size(36, 46),
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
                      <Box p={2} maxW="240px">
                        <Flex align="center" gap={2} mb={2}>
                          <Box
                            w="32px" h="32px" borderRadius="8px" display="flex" alignItems="center"
                            justifyContent="center" fontSize="1rem" flexShrink={0}
                            style={{
                              background: `${getCategoryInfo(selectedMarker.category).color}18`,
                              border: `1.5px solid ${getCategoryInfo(selectedMarker.category).color}30`,
                            }}
                          >
                            {getCategoryInfo(selectedMarker.category).emoji}
                          </Box>
                          <Box>
                            <Text fontWeight="800" fontSize="sm" color={PRIMARY}>
                              {getCategoryInfo(selectedMarker.category).label}
                            </Text>
                            {selectedMarker.location_name && (
                              <Text fontSize="0.68rem" color={MUTED}>📍 {selectedMarker.location_name}</Text>
                            )}
                          </Box>
                        </Flex>
                        <Text fontSize="sm" color={PRIMARY} mb={2} lineHeight="1.5">
                          {selectedMarker.description}
                        </Text>
                        <Flex align="center" justify="space-between">
                          <Text fontSize="0.68rem" color={SUBTLE}>{timeAgo(selectedMarker.minutes_ago)}</Text>
                          <Flex align="center" gap={1} px={2} py={0.5} borderRadius="full"
                            style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                            <Text fontSize="0.68rem" color="#16a34a" fontWeight="700">
                              👍 {selectedMarker.upvotes} confirmed
                            </Text>
                          </Flex>
                        </Flex>
                      </Box>
                    </InfoWindow>
                  )}
                </GoogleMap>
              ) : (
                <Box position="relative" overflow="hidden">
                  <Skeleton h="480px" borderRadius="0" />
                  <Box position="absolute" inset="0" style={{
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                    animation: "shimmerSlide 1.8s ease-in-out infinite",
                  }} />
                </Box>
              )}
            </Box>

            {/* ══ LIVE FEED PANEL ══ */}
            <Box style={{ animation: "slideUpFade 0.55s 0.3s both" }}>
              {/* Feed header */}
              <Flex align="center" justify="space-between" mb={5}>
                <Box>
                  <Text fontSize="0.6rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={1}>
                    Community Reports
                  </Text>
                  <Heading size="lg" color={PRIMARY} fontWeight="900">Live Feed</Heading>
                </Box>
                <Flex align="center" gap={2} px={4} py={2} borderRadius="full"
                  style={{
                    background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
                    border: "1px solid #bbf7d0",
                    boxShadow: "0 2px 10px rgba(16,185,129,0.15)",
                  }}>
                  <Box w="7px" h="7px" borderRadius="full" bg={GREEN}
                    style={{ animation: "pulseRing 2s ease-in-out infinite" }} />
                  <Text fontSize="xs" color="#16a34a" fontWeight="700">Auto-refreshing</Text>
                </Flex>
              </Flex>

              {/* Feed content */}
              {disruptionsQuery.isLoading ? (
                <VStack gap={4}>
                  {[0, 1, 2].map((i) => (
                    <Box key={i} borderRadius="20px" overflow="hidden" position="relative" w="full">
                      <Skeleton h="96px" borderRadius="20px" />
                      <Box position="absolute" inset="0" style={{
                        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
                        animation: `shimmerSlide 1.8s ${i * 0.2}s ease-in-out infinite`,
                      }} />
                    </Box>
                  ))}
                </VStack>
              ) : filtered.length === 0 ? (
                <Box
                  textAlign="center" py={14}
                  borderRadius="28px"
                  style={{
                    background: "linear-gradient(135deg, #f0fdf4, #ecfdf5)",
                    border: "1.5px dashed #6ee7b7",
                  }}
                >
                  <Text fontSize="3.5rem" mb={3}>🙌</Text>
                  <Text fontWeight="800" color={PRIMARY} fontSize="lg" mb={1}>All Clear!</Text>
                  <Text fontSize="sm" color={MUTED} maxW="280px" mx="auto" lineHeight="1.65">
                    No disruptions near you. Be the first to report if you spot something.
                  </Text>
                </Box>
              ) : (
                <VStack
                  gap={3} align="stretch"
                  maxH="520px" overflowY="auto"
                  className="feed-scroll"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {filtered.map((d, idx) => {
                    const cat = getCategoryInfo(d.category)
                    const alreadyUpvoted = upvotedIds.has(d.id)
                    const isTrending = d.upvotes >= 3
                    const isNew = d.minutes_ago < 10

                    return (
                      <Box
                        key={d.id}
                        className="community-report-card"
                        style={{
                          animation: `floatIn 0.42s ${Math.min(idx * 0.06, 0.36)}s cubic-bezier(0.22,1,0.36,1) both`,
                          background: CAT_GRADIENT[d.category] ?? CAT_GRADIENT.other,
                          border: `1.5px solid ${cat.color}22`,
                          borderLeft: `4px solid ${cat.color}`,
                          borderRadius: "20px",
                          padding: "16px 18px",
                          boxShadow: isTrending
                            ? `0 4px 20px ${cat.color}22`
                            : "0 2px 10px rgba(0,0,0,0.05)",
                        }}
                      >
                        <Flex align="flex-start" gap={3}>
                          {/* Icon */}
                          <Flex
                            w="48px" h="48px" borderRadius="14px" flexShrink={0}
                            align="center" justify="center" fontSize="1.5rem"
                            style={{
                              background: `linear-gradient(135deg, ${cat.color}22, ${cat.color}08)`,
                              border: `1.5px solid ${cat.color}30`,
                              boxShadow: `0 4px 14px ${cat.color}25`,
                            }}
                          >
                            {cat.emoji}
                          </Flex>

                          <Box flex={1} minW={0}>
                            {/* Badges row */}
                            <Flex align="center" gap={1.5} mb={1.5} flexWrap="wrap">
                              <Box
                                px={2.5} py={0.5} borderRadius="full" fontSize="0.62rem" fontWeight="800"
                                style={{
                                  background: `${cat.color}18`,
                                  color: cat.color,
                                  border: `1px solid ${cat.color}30`,
                                  letterSpacing: "0.03em",
                                }}
                              >
                                {cat.label}
                              </Box>
                              {isTrending && (
                                <Box px={2.5} py={0.5} borderRadius="full" fontSize="0.62rem" fontWeight="800"
                                  style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
                                  <span className="fire-emoji">🔥</span> Trending
                                </Box>
                              )}
                              {isNew && (
                                <Box className="new-badge" px={2.5} py={0.5} borderRadius="full" fontSize="0.62rem" fontWeight="800"
                                  style={{ background: "#dcfce7", color: "#16a34a", border: "1px solid #bbf7d0" }}>
                                  🆕 New
                                </Box>
                              )}
                            </Flex>

                            {/* Location */}
                            {d.location_name && (
                              <Text fontSize="0.7rem" color={MUTED} fontWeight="600" mb={0.5}
                                style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                📍 {d.location_name}
                              </Text>
                            )}

                            {/* Description */}
                            <Text fontSize="sm" color={PRIMARY} lineHeight="1.55" mb={2}
                              style={{ display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
                              {d.description}
                            </Text>

                            {/* Footer */}
                            <Flex align="center" justify="space-between">
                              <Text fontSize="0.68rem" color={SUBTLE} fontWeight="600">
                                {timeAgo(d.minutes_ago)}
                              </Text>
                              <button
                                className="upvote-btn"
                                onClick={() => !alreadyUpvoted && upvoteMutation.mutate(d.id)}
                                style={{
                                  padding: "5px 14px",
                                  borderRadius: "999px",
                                  border: `1.5px solid ${alreadyUpvoted ? "#16a34a" : BORDER}`,
                                  fontWeight: "700",
                                  fontSize: "12px",
                                  cursor: alreadyUpvoted ? "default" : "pointer",
                                  background: alreadyUpvoted
                                    ? "linear-gradient(135deg, #dcfce7, #bbf7d0)"
                                    : CARD,
                                  color: alreadyUpvoted ? "#16a34a" : MUTED,
                                  boxShadow: alreadyUpvoted
                                    ? "0 2px 10px rgba(16,185,129,0.25)"
                                    : "0 1px 4px rgba(0,0,0,0.06)",
                                }}
                              >
                                👍 {d.upvotes}&nbsp;
                                <span style={{ opacity: 0.75 }}>
                                  {alreadyUpvoted ? "· Confirmed!" : "· Confirm"}
                                </span>
                              </button>
                              <button
                                onClick={() => resolveMutation.mutate(d.id)}
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: "999px",
                                  border: `1.5px solid #e2e8f0`,
                                  fontWeight: "700",
                                  fontSize: "12px",
                                  cursor: "pointer",
                                  background: "#fff",
                                  color: "#718096",
                                  marginLeft: "6px",
                                }}
                                title="Mark as resolved"
                              >
                                ✅ Resolved
                              </button>
                            </Flex>
                          </Box>
                        </Flex>
                      </Box>
                    )
                  })}
                </VStack>
              )}
            </Box>
          </Grid>

        </VStack>
      </Container>
    </Box>
  )
}
