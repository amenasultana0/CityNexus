import { useState, useEffect, useCallback, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Box, Container, Flex, Grid, Heading, Input, Text, VStack, Textarea,
} from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import { Skeleton } from "@/components/ui/skeleton"
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Autocomplete } from "@react-google-maps/api"

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
const RESOLVE_THRESHOLD = 5

const PHOTO_REQUIRED_CATEGORIES = new Set([
  "road_block", "pothole", "construction", "signal_down",
  "accident", "vehicle_fire", "flooding", "waterlogging", "visibility",
])

const CATEGORY_GROUPS = [
  {
    group: "Transport",
    items: [
      { id: "metro_issue",   label: "Metro Issue",         emoji: "🚇", color: TEAL },
      { id: "bus_delay",     label: "Bus Delay",           emoji: "🚌", color: BLUE },
      { id: "auto_strike",   label: "Auto Strike",         emoji: "🛺", color: AMBER },
      { id: "cab_surge",     label: "Cab Surge",           emoji: "🚕", color: "#f97316" },
      { id: "mmts_issue",    label: "MMTS Issue",          emoji: "🚂", color: PURPLE },
    ],
  },
  {
    group: "Roads",
    items: [
      { id: "road_block",    label: "Road Block",          emoji: "🚧", color: RED },
      { id: "pothole",       label: "Pothole / Damage",    emoji: "🕳️", color: "#78716c" },
      { id: "construction",  label: "Construction",        emoji: "🏗️", color: "#a16207" },
      { id: "signal_down",   label: "Signal Down",         emoji: "🚦", color: "#dc2626" },
    ],
  },
  {
    group: "Incidents",
    items: [
      { id: "accident",      label: "Accident",            emoji: "🚨", color: "#dc2626" },
      { id: "police_naaka",  label: "Police Naaka",        emoji: "👮", color: PURPLE },
      { id: "vehicle_fire",  label: "Vehicle Fire",        emoji: "🔥", color: "#ea580c" },
      { id: "vip_movement",  label: "VIP Movement",        emoji: "🚓", color: "#0369a1" },
    ],
  },
  {
    group: "Environment",
    items: [
      { id: "flooding",      label: "Flooding",            emoji: "🌊", color: BLUE },
      { id: "waterlogging",  label: "Waterlogging",        emoji: "🌧️", color: "#0891b2" },
      { id: "visibility",    label: "Dust / Fog",          emoji: "🌫️", color: MUTED },
      { id: "power_outage",  label: "Power Outage",        emoji: "⚡", color: AMBER },
    ],
  },
  {
    group: "Events",
    items: [
      { id: "procession",    label: "Procession",          emoji: "🎉", color: "#7c3aed" },
      { id: "religious",     label: "Religious Gathering", emoji: "🙏", color: "#b45309" },
      { id: "stadium",       label: "Stadium Traffic",     emoji: "🏟️", color: GREEN },
    ],
  },
  {
    group: "Other",
    items: [
      { id: "other",         label: "Other",               emoji: "⚠️", color: MUTED },
    ],
  },
]

const CATEGORIES = CATEGORY_GROUPS.flatMap((g) => g.items)

function getCategoryInfo(id: string) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]
}

function getCatGradient(color: string): string {
  return `linear-gradient(135deg, ${color}16, ${color}06)`
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function timeAgo(minutes: number, timestamp?: string): string {
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 48 * 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`
  }
  if (timestamp) {
    const date = new Date(timestamp)
    const now = new Date()
    return date.toLocaleDateString("en-IN", {
      day: "numeric", month: "short",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    })
  }
  return `${Math.floor(minutes / (60 * 24))}d ago`
}

interface Comment {
  id: number
  report_id: number
  text: string
  posted_at: string
  minutes_ago: number
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
  photo_url: string | null
  comment_count: number
  resolve_votes: number
}

interface DisruptionsResponse {
  disruptions: Disruption[]
  total: number
}

interface CommentsResponse {
  comments: Comment[]
  total: number
}

async function fetchDisruptions(lat: number, lon: number): Promise<DisruptionsResponse> {
  const res = await fetch(`/api/v1/community/disruptions?lat=${lat}&lon=${lon}&radius_km=15`)
  if (!res.ok) throw new Error("Failed")
  return res.json()
}

async function fetchComments(reportId: number): Promise<CommentsResponse> {
  const res = await fetch(`/api/v1/community/disruptions/${reportId}/comments`)
  if (!res.ok) throw new Error("Failed")
  return res.json()
}

async function postComment(data: { reportId: number; text: string }): Promise<Comment> {
  const fd = new FormData()
  fd.append("text", data.text)
  const res = await fetch(`/api/v1/community/disruptions/${data.reportId}/comments`, {
    method: "POST", body: fd,
  })
  if (!res.ok) throw new Error("Failed")
  return res.json()
}

async function submitReport(data: FormData): Promise<Disruption> {
  const res = await fetch("/api/v1/community/report", { method: "POST", body: data })
  if (!res.ok) throw new Error("Failed")
  return res.json()
}

async function upvoteReport(id: number): Promise<Disruption> {
  const res = await fetch(`/api/v1/community/disruptions/${id}/upvote`, { method: "POST" })
  if (!res.ok) throw new Error("Failed")
  return res.json()
}

async function voteResolve(id: number): Promise<Disruption> {
  const res = await fetch(`/api/v1/community/disruptions/${id}/resolve-vote`, { method: "POST" })
  if (!res.ok) throw new Error("Failed")
  return res.json()
}

// ── Comment section ───────────────────────────────────────────
function CommentSection({ report, cat }: { report: Disruption; cat: ReturnType<typeof getCategoryInfo> }) {
  const qc = useQueryClient()
  const [commentText, setCommentText] = useState("")
  const [commentError, setCommentError] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  const commentsQuery = useQuery({
    queryKey: ["comments", report.id],
    queryFn: () => fetchComments(report.id),
  })

  const commentMutation = useMutation({
    mutationFn: postComment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", report.id] })
      qc.invalidateQueries({ queryKey: ["disruptions"] })
      setCommentText("")
      setCommentError("")
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
    },
    onError: () => setCommentError("Failed to post — try again"),
  })

  const handlePost = () => {
    if (!commentText.trim()) { setCommentError("Comment cannot be empty"); return }
    commentMutation.mutate({ reportId: report.id, text: commentText.trim() })
  }

  const comments = commentsQuery.data?.comments ?? []

  return (
    <Box mt={3} pt={3} style={{ borderTop: `1px solid ${cat.color}22`, animation: "slideUpFade 0.3s both" }}>
      {commentsQuery.isLoading ? (
        <Box py={2}><Skeleton h="40px" borderRadius="8px" /></Box>
      ) : comments.length === 0 ? (
        <Text fontSize="0.72rem" color={SUBTLE} mb={3} fontStyle="italic">
          No comments yet — be the first to add context
        </Text>
      ) : (
        <VStack align="stretch" gap={2} mb={3} maxH="200px" overflowY="auto" style={{ scrollbarWidth: "thin" }}>
          {comments.map((c) => (
            <Flex key={c.id} gap={2} align="flex-start">
              <Box w="26px" h="26px" borderRadius="full" flexShrink={0}
                display="flex" alignItems="center" justifyContent="center"
                fontSize="0.65rem" fontWeight="800"
                style={{ background: `${cat.color}18`, color: cat.color, border: `1px solid ${cat.color}30` }}>
                {String.fromCharCode(65 + (c.id % 26))}
              </Box>
              <Box flex={1} px={3} py={2} borderRadius="12px"
                style={{ background: `${cat.color}08`, border: `1px solid ${cat.color}18` }}>
                <Text fontSize="0.78rem" color={PRIMARY} lineHeight="1.5">{c.text}</Text>
                <Text fontSize="0.62rem" color={SUBTLE} mt={0.5}>{timeAgo(c.minutes_ago, c.posted_at)}</Text>
              </Box>
            </Flex>
          ))}
          <div ref={bottomRef} />
        </VStack>
      )}
      <Flex gap={2} align="flex-start">
        <Input
          placeholder="Add a comment..."
          value={commentText}
          onChange={(e) => { setCommentText(e.target.value); setCommentError("") }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePost() } }}
          bg={CARD} borderColor={commentError ? RED : BORDER} borderRadius="10px"
          color={PRIMARY} fontSize="0.8rem" size="sm" maxLength={200}
          _focus={{ borderColor: cat.color, boxShadow: `0 0 0 2px ${cat.color}22` }}
        />
        <button onClick={handlePost} disabled={commentMutation.isPending || !commentText.trim()} style={{
          padding: "6px 16px", borderRadius: "10px", border: "none", fontWeight: "700", fontSize: "12px",
          cursor: commentMutation.isPending || !commentText.trim() ? "not-allowed" : "pointer",
          background: commentMutation.isPending || !commentText.trim() ? "#e2e8f0" : `linear-gradient(135deg, ${cat.color}, ${cat.color}cc)`,
          color: commentMutation.isPending || !commentText.trim() ? MUTED : "#fff",
          whiteSpace: "nowrap", transition: "all 0.2s ease", flexShrink: 0,
        }}>
          {commentMutation.isPending ? "…" : "Post"}
        </button>
      </Flex>
      {commentError && <Text fontSize="0.65rem" color={RED} mt={1} fontWeight="600">{commentError}</Text>}
      <Text fontSize="0.6rem" color={SUBTLE} mt={1} textAlign="right">{commentText.length}/200 · Enter to post</Text>
    </Box>
  )
}

// ── Main page ─────────────────────────────────────────────────
function CommunityPage() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mapCenter, setMapCenter]               = useState(HYD_CENTER)
  const [selectedMarker, setSelectedMarker]     = useState<Disruption | null>(null)
  const [showForm, setShowForm]                 = useState(false)
  const [formCategory, setFormCategory]         = useState("road_block")
  const [formDesc, setFormDesc]                 = useState("")
  const [formLocation, setFormLocation]         = useState("")
  const [formLat, setFormLat]                   = useState(HYD_CENTER.lat)
  const [formLon, setFormLon]                   = useState(HYD_CENTER.lng)
  const [filterCategory, setFilterCategory]     = useState<string | null>(null)
  const [searchText, setSearchText]             = useState("")
  const [searchLat, setSearchLat]               = useState<number | null>(null)
  const [searchLng, setSearchLng]               = useState<number | null>(null)
  const searchAcRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [submitError, setSubmitError]           = useState("")
  const [upvotedIds, setUpvotedIds]             = useState<Set<number>>(new Set())
  const [resolveVotedIds, setResolveVotedIds]   = useState<Set<number>>(new Set())
  const [locationPinned, setLocationPinned]     = useState(false)
  const [photoFile, setPhotoFile]               = useState<File | null>(null)
  const [photoPreview, setPhotoPreview]         = useState<string | null>(null)
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set())

  const photoRequired = PHOTO_REQUIRED_CATEGORIES.has(formCategory)

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  })

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: lat, longitude: lon } = pos.coords
      if (lat >= 17.0 && lat <= 18.0 && lon >= 78.0 && lon <= 79.0) {
        setMapCenter({ lat, lng: lon }); setFormLat(lat); setFormLon(lon)
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
      setShowForm(false); setFormDesc(""); setFormLocation("")
      setSubmitError(""); setLocationPinned(false)
      setPhotoFile(null); setPhotoPreview(null)
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
    mutationFn: voteResolve,
    onSuccess: (updated) => {
      setResolveVotedIds((prev) => new Set(prev).add(updated.id))
      qc.invalidateQueries({ queryKey: ["disruptions"] })
    },
  })

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng || !showForm) return
    setFormLat(e.latLng.lat()); setFormLon(e.latLng.lng()); setLocationPinned(true)
  }, [showForm])

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setSubmitError("Photo must be under 5 MB"); return }
    setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); setSubmitError("")
  }

  const handleRemovePhoto = () => {
    setPhotoFile(null); setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSubmit = () => {
    setSubmitError("")
    if (!formLocation.trim()) { setSubmitError("Location name is required — e.g. Ameerpet Metro Station"); return }
    if (!locationPinned && formLat === HYD_CENTER.lat && formLon === HYD_CENTER.lng) {
      setSubmitError("Please click the map to pin the exact location of the incident")
      return
    }
    if (formCategory === "other" && !formDesc.trim()) { setSubmitError("Please describe the issue when selecting 'Other'"); return }
    if (photoRequired && !photoFile) { setSubmitError(`A photo is required for "${getCategoryInfo(formCategory).label}" reports`); return }
    const fd = new FormData()
    fd.append("lat", formLat.toString()); fd.append("lon", formLon.toString())
    fd.append("category", formCategory)
    fd.append("description", formCategory === "other" ? formDesc.trim() : "")
    fd.append("location_name", formLocation.trim())
    if (photoFile) fd.append("photo", photoFile)
    submitMutation.mutate(fd)
  }

  const toggleComments = (id: number) => {
    setExpandedComments((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const disruptions = disruptionsQuery.data?.disruptions ?? []
  const filtered = disruptions.filter((d) => {
    const matchCat = filterCategory ? d.category === filterCategory : true
    let matchSearch = true
    if (searchLat !== null && searchLng !== null) {
      matchSearch = haversineKm(searchLat, searchLng, d.lat, d.lon) <= 2.5
    } else if (searchText.trim()) {
      const q = searchText.toLowerCase()
      matchSearch = (d.location_name ?? "").toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q)
    }
    return matchCat && matchSearch
  })
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
        @keyframes floatIn {
          from { opacity: 0; transform: translateX(-18px) scale(0.96); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes pulseRing {
          0%   { box-shadow: 0 0 0 0   rgba(16,185,129,0.7); }
          70%  { box-shadow: 0 0 0 10px rgba(16,185,129,0); }
          100% { box-shadow: 0 0 0 0   rgba(16,185,129,0); }
        }
        @keyframes pulseRingRed {
          0%   { box-shadow: 0 0 0 0   rgba(239,68,68,0.6); }
          70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
          100% { box-shadow: 0 0 0 0   rgba(239,68,68,0); }
        }
        @keyframes firePulse {
          0%,100% { transform: scale(1) rotate(-4deg); }
          50%     { transform: scale(1.25) rotate(4deg); }
        }
        @keyframes orbFloat {
          0%,100% { transform: translateY(0) scale(1); }
          50%     { transform: translateY(-18px) scale(1.06); }
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
        @keyframes photoSlideIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .community-report-card {
          transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s ease;
        }
        .community-report-card:hover {
          transform: translateX(6px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.1) !important;
        }
        .upvote-btn { transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1); }
        .upvote-btn:hover { transform: scale(1.08); }
        .upvote-btn:active { animation: upvotePop 0.38s ease; }
        .resolve-btn { transition: all 0.2s ease; }
        .resolve-btn:hover:not(:disabled) { transform: scale(1.04); }
        .cat-pill { transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1); }
        .cat-pill:hover { transform: translateY(-2px) scale(1.04); }
        .hero-stat-glass {
          transition: transform 0.28s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.28s ease;
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
        .comment-toggle { transition: all 0.18s ease; }
        .comment-toggle:hover { opacity: 0.8; transform: scale(1.03); }
        .group-label {
          font-size: 0.58rem; font-weight: 700; letter-spacing: 1.4px;
          text-transform: uppercase; color: ${SUBTLE}; margin-bottom: 8px; display: block;
        }
        .photo-drop-zone { transition: all 0.2s ease; }
        .photo-drop-zone:hover { border-color: #ef4444 !important; background: rgba(239,68,68,0.04) !important; }
        .photo-preview-enter { animation: photoSlideIn 0.35s cubic-bezier(0.22,1,0.36,1) both; }
      `}</style>

      {/* ══ HERO ══ */}
      <Box position="relative" overflow="hidden"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 30%, #0c4a6e 65%, #134e4a 100%)",
          backgroundSize: "300% 300%", animation: "gradientShift 10s ease infinite",
        }}
        px={6} pt={10} pb={10}
      >
        <Box position="absolute" inset="0" pointerEvents="none" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
        }} />
        <Box position="absolute" top="-40%" left="8%" w="400px" h="400px" borderRadius="full" pointerEvents="none"
          style={{ background: "radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)", animation: "orbFloat 7s ease-in-out infinite" }} />
        <Box position="absolute" bottom="-30%" right="4%" w="320px" h="320px" borderRadius="full" pointerEvents="none"
          style={{ background: "radial-gradient(circle, rgba(6,148,162,0.22) 0%, transparent 70%)", animation: "orbFloat 9s ease-in-out infinite 2s" }} />
        <Box position="absolute" top="20%" right="22%" w="200px" h="200px" borderRadius="full" pointerEvents="none"
          style={{ background: "radial-gradient(circle, rgba(245,158,11,0.14) 0%, transparent 70%)", animation: "orbFloat 6s ease-in-out infinite 1s" }} />

        <Container maxW="full" position="relative" zIndex={1}>
          <Flex align="flex-start" justify="space-between" mb={8} flexWrap="wrap" gap={5}>
            <Box style={{ animation: "slideUpFade 0.5s both" }}>
              <Flex align="center" gap={2} mb={3}>
                <Box w="9px" h="9px" borderRadius="full" bg="#10b981"
                  style={{ animation: "pulseRing 2s ease-in-out infinite" }} />
                <Text fontSize="0.62rem" color="rgba(255,255,255,0.55)" fontWeight="700" letterSpacing="2.5px" textTransform="uppercase">
                  HydAlert · Live Feed
                </Text>
              </Flex>
              <Heading fontWeight="900" lineHeight="1.0" mb={3}
                fontSize={{ base: "2.8rem", md: "4rem" }}
                style={{
                  background: "linear-gradient(135deg, #ffffff 0%, #a5f3fc 35%, #c4b5fd 65%, #fde68a 100%)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  backgroundClip: "text", backgroundSize: "200% 200%",
                  animation: "gradientShift 6s ease infinite",
                }}>
                Hyderabad<br />Alert
              </Heading>
              <Text color="rgba(255,255,255,0.5)" fontSize="md" maxW="420px" lineHeight="1.65">
                Live disruption alerts from Hyderabad commuters — report road blocks, metro issues, flooding and more in real-time.
              </Text>
            </Box>
            <Box style={{ animation: "slideUpFade 0.5s 0.15s both" }}>
              <button className="report-btn-fancy"
                onClick={() => { setShowForm(!showForm); setSubmitError("") }}
                style={{
                  padding: "15px 30px", borderRadius: "18px",
                  border: showForm ? "1.5px solid rgba(255,255,255,0.2)" : "none",
                  fontWeight: "800", fontSize: "15px", cursor: "pointer",
                  background: showForm ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                  color: "#fff", backdropFilter: showForm ? "blur(12px)" : undefined,
                  boxShadow: showForm ? "0 4px 20px rgba(0,0,0,0.2)" : "0 8px 36px rgba(239,68,68,0.55), 0 2px 8px rgba(0,0,0,0.3)",
                  letterSpacing: "0.01em",
                }}>
                {showForm ? "✕  Cancel" : "⚠️  Report Disruption"}
              </button>
            </Box>
          </Flex>

          <Grid templateColumns={{ base: "1fr 1fr", md: "repeat(3,1fr)" }} gap={4}>
            {[
              { label: "Live Reports", value: disruptions.length.toString(), unit: "within 15 km radius", accent: "#f87171", delay: "0s" },
              { label: "Most Reported", value: topCategory ? getCategoryInfo(topCategory[0]).emoji : "—", unit: topCategory ? getCategoryInfo(topCategory[0]).label : "No reports yet", accent: "#fbbf24", delay: "0.08s" },
              { label: "Feed Status", value: "LIVE", unit: "Refreshes every 60s", accent: "#34d399", delay: "0.24s" },
            ].map((stat, i) => (
              <Box key={i} className="hero-stat-glass" style={{
                background: "rgba(255,255,255,0.07)", backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.13)",
                borderRadius: "22px", padding: "22px 20px",
                animation: `slideUpFade 0.55s ${stat.delay} both`, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              }}>
                <Text fontSize="0.58rem" color="rgba(255,255,255,0.45)" fontWeight="800" letterSpacing="2px" textTransform="uppercase" mb={3}>{stat.label}</Text>
                <Text fontWeight="900" lineHeight="1" mb={1} fontSize={stat.value.length > 4 ? "1.8rem" : "2.4rem"}
                  style={{ color: stat.accent, animation: "countFadeUp 0.6s both" }}>{stat.value}</Text>
                <Text fontSize="0.7rem" color="rgba(255,255,255,0.38)" fontWeight="600">{stat.unit}</Text>
              </Box>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ══ MAIN BODY ══ */}
      <Container maxW="full" px={6} py={7}>
        <VStack gap={7} align="stretch">

          {/* Filter pills */}
          <Box style={{ animation: "slideUpFade 0.5s 0.1s both" }}>
            <Text fontSize="0.6rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={3}>
              Filter by Category
            </Text>
            <Flex gap={2} flexWrap="wrap">
              <button className="cat-pill" onClick={() => setFilterCategory(null)} style={{
                padding: "9px 22px", borderRadius: "999px",
                border: `1.5px solid ${filterCategory === null ? "transparent" : BORDER}`,
                fontWeight: "700", fontSize: "13px", cursor: "pointer",
                background: filterCategory === null ? "linear-gradient(135deg, #1a202c, #2d3748)" : CARD,
                color: filterCategory === null ? "#fff" : MUTED,
                boxShadow: filterCategory === null ? "0 4px 18px rgba(26,32,44,0.35)" : "0 2px 6px rgba(0,0,0,0.04)",
                transform: filterCategory === null ? "scale(1.06)" : "scale(1)",
              }}>
                ✦ All &nbsp;<span style={{ opacity: 0.7 }}>{disruptions.length}</span>
              </button>
              {CATEGORIES.filter((c) => byCat[c.id]).map((cat) => {
                const active = filterCategory === cat.id
                return (
                  <button key={cat.id} className="cat-pill" onClick={() => setFilterCategory(active ? null : cat.id)} style={{
                    padding: "9px 20px", borderRadius: "999px",
                    border: `1.5px solid ${active ? "transparent" : BORDER}`,
                    fontWeight: "700", fontSize: "13px", cursor: "pointer",
                    background: active ? `linear-gradient(135deg, ${cat.color}, ${cat.color}cc)` : CARD,
                    color: active ? "#fff" : MUTED,
                    boxShadow: active ? `0 4px 18px ${cat.color}55` : "0 2px 6px rgba(0,0,0,0.04)",
                    transform: active ? "scale(1.06)" : "scale(1)",
                  }}>
                    {cat.emoji} {cat.label}&nbsp;
                    <span style={{
                      background: active ? "rgba(255,255,255,0.25)" : "#f1f5f9",
                      color: active ? "#fff" : MUTED,
                      borderRadius: "999px", padding: "1px 7px", fontSize: "11px",
                    }}>{byCat[cat.id]}</span>
                  </button>
                )
              })}
            </Flex>
          </Box>

          {/* ── Area Search ── */}
          <Box style={{ animation: "slideUpFade 0.5s 0.12s both" }}>
            <Flex
              align="center" gap={2} px={4} borderRadius="18px"
              style={{
                background: CARD,
                border: `1.5px solid ${searchText ? TEAL : BORDER}`,
                boxShadow: searchText ? `0 0 0 3px ${TEAL}18, 0 4px 16px rgba(0,0,0,0.06)` : "0 4px 16px rgba(0,0,0,0.05)",
                transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                height: "48px",
              }}
            >
              <Text fontSize="1rem" flexShrink={0} style={{ opacity: searchText ? 1 : 0.45, lineHeight: 1 }}>🔍</Text>
              {isLoaded ? (
                <Autocomplete
                  onLoad={(ref) => (searchAcRef.current = ref)}
                  onPlaceChanged={() => {
                    const place = searchAcRef.current?.getPlace()
                    if (place?.geometry?.location) {
                      setSearchLat(place.geometry.location.lat())
                      setSearchLng(place.geometry.location.lng())
                      setSearchText(place.name || place.formatted_address || searchText)
                    }
                  }}
                  options={{
                    componentRestrictions: { country: "in" },
                    bounds: new google.maps.LatLngBounds({ lat: 17.2, lng: 78.2 }, { lat: 17.6, lng: 78.7 }),
                    strictBounds: false,
                    types: ["geocode", "establishment"],
                  }}
                >
                  <input
                    placeholder="Search area… e.g. Ameerpet, Hitech City, Gachibowli"
                    value={searchText}
                    onChange={(e) => {
                      setSearchText(e.target.value)
                      setSearchLat(null)
                      setSearchLng(null)
                    }}
                    style={{
                      flex: 1, width: "100%", border: "none", outline: "none", background: "transparent",
                      fontSize: "14px", color: PRIMARY, fontFamily: "inherit", height: "46px",
                    }}
                  />
                </Autocomplete>
              ) : (
                <input
                  placeholder="Search area… e.g. Ameerpet, Hitech City"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  style={{
                    flex: 1, border: "none", outline: "none", background: "transparent",
                    fontSize: "14px", color: PRIMARY, fontFamily: "inherit", height: "46px",
                  }}
                />
              )}
              {searchText && (
                <>
                  <Box px={2.5} py={0.5} borderRadius="full" flexShrink={0}
                    style={{ background: `${TEAL}12`, border: `1px solid ${TEAL}30`, fontSize: "0.65rem", fontWeight: "700", color: TEAL, whiteSpace: "nowrap" }}>
                    {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                  </Box>
                  <button onClick={() => { setSearchText(""); setSearchLat(null); setSearchLng(null) }} style={{
                    border: "none", background: "none", cursor: "pointer", color: MUTED,
                    fontSize: "16px", lineHeight: 1, padding: "0 2px", flexShrink: 0,
                  }}>✕</button>
                </>
              )}
            </Flex>
            {searchLat !== null && (
              <Text fontSize="0.65rem" color={TEAL} fontWeight="600" mt={1.5} ml={1}>
                📍 Showing reports within 2.5 km · <span style={{ color: MUTED, fontWeight: 500 }}>tap ✕ to clear</span>
              </Text>
            )}
          </Box>

          {/* ══ REPORT FORM ══ */}
          {showForm && (
            <Box style={{
              animation: "slideUpFade 0.42s cubic-bezier(0.22,1,0.36,1) both",
              background: "linear-gradient(135deg, rgba(239,68,68,0.05) 0%, rgba(255,255,255,0.95) 100%)",
              border: "1.5px solid rgba(239,68,68,0.25)", borderRadius: "28px",
              padding: "32px 28px",
              boxShadow: "0 12px 48px rgba(239,68,68,0.12), 0 2px 12px rgba(0,0,0,0.06)",
              backdropFilter: "blur(8px)",
            }}>
              <Flex align="center" gap={4} mb={7}>
                <Box w="56px" h="56px" borderRadius="18px" flexShrink={0}
                  display="flex" alignItems="center" justifyContent="center" fontSize="1.7rem"
                  style={{
                    background: "linear-gradient(135deg, #fee2e2, #fecaca)",
                    boxShadow: "0 6px 20px rgba(239,68,68,0.3)",
                    animation: "pulseRingRed 2.5s ease-in-out infinite",
                  }}>⚠️</Box>
                <Box>
                  <Heading size="md" color={PRIMARY} fontWeight="800" mb={0.5}>Report a Disruption</Heading>
                  <Text fontSize="sm" color={MUTED}>📍 Click the map to pin the exact spot, then fill in the details below</Text>
                </Box>
              </Flex>

              <Text fontSize="0.6rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={4}>
                What's happening?
              </Text>
              <VStack align="stretch" gap={5} mb={7}>
                {CATEGORY_GROUPS.map((group) => (
                  <Box key={group.group}>
                    <span className="group-label">{group.group}</span>
                    <Flex gap={2} flexWrap="wrap">
                      {group.items.map((cat) => {
                        const active = formCategory === cat.id
                        return (
                          <button key={cat.id} className="cat-pill"
                            onClick={() => {
                              setFormCategory(cat.id); setFormDesc(""); setSubmitError("")
                              setPhotoFile(null); setPhotoPreview(null)
                              if (fileInputRef.current) fileInputRef.current.value = ""
                            }}
                            style={{
                              padding: "9px 16px", borderRadius: "12px",
                              border: `1.5px solid ${active ? cat.color : BORDER}`,
                              fontWeight: "700", fontSize: "13px", cursor: "pointer",
                              background: active ? `linear-gradient(135deg, ${cat.color}, ${cat.color}bb)` : INPUT_BG,
                              color: active ? "#fff" : MUTED,
                              boxShadow: active ? `0 4px 16px ${cat.color}44` : "none",
                              transform: active ? "scale(1.04)" : "scale(1)",
                            }}>
                            {cat.emoji} {cat.label}
                          </button>
                        )
                      })}
                    </Flex>
                  </Box>
                ))}
              </VStack>

              <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={5} mb={6}>
                <Box>
                  <Flex align="center" gap={1.5} mb={2}>
                    <Text fontSize="0.6rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase">Location Name</Text>
                    <Box px={1.5} py={0.5} borderRadius="4px" fontSize="0.55rem" fontWeight="800"
                      style={{ background: "#fee2e2", color: "#b91c1c", letterSpacing: "0.05em" }}>REQUIRED</Box>
                  </Flex>
                  <Input
                    placeholder="e.g. Ameerpet Metro Station, Hitech City signal"
                    value={formLocation}
                    onChange={(e) => { setFormLocation(e.target.value); setSubmitError("") }}
                    bg={CARD} borderColor={submitError.toLowerCase().includes("location") ? RED : BORDER}
                    borderRadius="12px" color={PRIMARY}
                    _focus={{ borderColor: RED, boxShadow: `0 0 0 3px ${RED}22` }}
                  />
                  <Text fontSize="0.65rem" color={SUBTLE} mt={1}>Be specific — helps others identify the spot quickly</Text>
                </Box>
                <Box>
                  <Text fontSize="0.6rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={2}>Pinned Coordinates</Text>
                  <Input
                    value={`${formLat.toFixed(4)}, ${formLon.toFixed(4)}`} readOnly
                    bg={locationPinned ? "#f0fdf4" : INPUT_BG}
                    borderColor={locationPinned ? "#86efac" : BORDER}
                    borderRadius="12px" color={locationPinned ? "#15803d" : MUTED}
                    fontWeight={locationPinned ? "700" : "400"}
                  />
                  <Text fontSize="0.65rem" color={locationPinned ? "#15803d" : SUBTLE} mt={1}>
                    {locationPinned ? "✓ Location pinned on map" : "Click the map below to pin exact spot"}
                  </Text>
                </Box>
              </Grid>

              {/* Photo upload */}
              <Box mb={6} style={{ animation: "slideUpFade 0.3s both" }}>
                <Flex align="center" gap={1.5} mb={2}>
                  <Text fontSize="0.6rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase">Photo</Text>
                  <Box px={1.5} py={0.5} borderRadius="4px" fontSize="0.55rem" fontWeight="800"
                    style={{
                      background: photoRequired ? "#fee2e2" : "#f0fdf4",
                      color: photoRequired ? "#b91c1c" : "#15803d",
                      letterSpacing: "0.05em",
                    }}>
                    {photoRequired ? "REQUIRED" : "OPTIONAL"}
                  </Box>
                  {photoRequired && (
                    <Text fontSize="0.6rem" color={MUTED} fontStyle="italic">— visual proof helps commuters verify this report</Text>
                  )}
                </Flex>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                  style={{ display: "none" }} onChange={handlePhotoChange} />
                {!photoPreview ? (
                  <Box className="photo-drop-zone" onClick={() => fileInputRef.current?.click()} style={{
                    border: `2px dashed ${submitError.includes("photo") || submitError.includes("Photo") ? RED : photoRequired ? "#fca5a5" : BORDER}`,
                    borderRadius: "16px", padding: "28px", textAlign: "center", cursor: "pointer",
                    background: submitError.includes("photo") || submitError.includes("Photo") ? "rgba(239,68,68,0.03)" : photoRequired ? "rgba(239,68,68,0.02)" : INPUT_BG,
                  }}>
                    <Text fontSize="2rem" mb={2}>📷</Text>
                    <Text fontSize="sm" color={PRIMARY} fontWeight="700" mb={1}>
                      {photoRequired ? "Tap to add a photo" : "Tap to add a photo (optional)"}
                    </Text>
                    <Text fontSize="0.68rem" color={SUBTLE}>JPG, PNG or WebP · max 5 MB</Text>
                  </Box>
                ) : (
                  <Box className="photo-preview-enter" style={{ position: "relative", borderRadius: "16px", overflow: "hidden", textAlign: "center", background: "rgba(0,0,0,0.03)", border: `1.5px solid ${BORDER}` }}>
                    <img src={photoPreview} alt="Report preview" style={{
                      display: "block", margin: "0 auto",
                      maxWidth: "100%", width: "auto",
                      maxHeight: "260px", height: "auto",
                      borderRadius: "14px",
                    }} />
                    <button onClick={handleRemovePhoto} style={{
                      position: "absolute", top: "10px", right: "10px",
                      width: "32px", height: "32px", borderRadius: "full",
                      border: "none", cursor: "pointer", background: "rgba(0,0,0,0.55)",
                      color: "#fff", fontWeight: "800", fontSize: "14px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      backdropFilter: "blur(4px)",
                    }} title="Remove photo">✕</button>
                    <button onClick={() => fileInputRef.current?.click()} style={{
                      position: "absolute", bottom: "10px", right: "10px",
                      padding: "6px 14px", borderRadius: "999px", border: "none", cursor: "pointer",
                      background: "rgba(0,0,0,0.55)", color: "#fff", fontWeight: "700", fontSize: "12px",
                      backdropFilter: "blur(4px)",
                    }}>🔄 Replace</button>
                    <Box style={{ position: "absolute", bottom: "10px", left: "10px", padding: "5px 12px", borderRadius: "999px", background: "rgba(16,185,129,0.9)" }}>
                      <Text fontSize="0.65rem" color="#fff" fontWeight="700">✓ Photo added</Text>
                    </Box>
                  </Box>
                )}
              </Box>

              {formCategory === "other" && (
                <Box mb={6} style={{ animation: "slideUpFade 0.3s both" }}>
                  <Flex align="center" gap={1.5} mb={2}>
                    <Text fontSize="0.6rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase">Describe the Issue</Text>
                    <Box px={1.5} py={0.5} borderRadius="4px" fontSize="0.55rem" fontWeight="800"
                      style={{ background: "#fee2e2", color: "#b91c1c", letterSpacing: "0.05em" }}>REQUIRED</Box>
                  </Flex>
                  <Textarea placeholder="Briefly describe what's happening so other commuters know what to expect..."
                    value={formDesc} onChange={(e) => setFormDesc(e.target.value)}
                    bg={CARD} borderColor={BORDER} borderRadius="12px" color={PRIMARY} rows={3} maxLength={300} />
                  <Flex justify="space-between" mt={1}>
                    <Text fontSize="0.65rem" color={SUBTLE}>Required when selecting Other</Text>
                    <Text fontSize="xs" color={formDesc.length > 270 ? AMBER : SUBTLE} fontWeight={formDesc.length > 270 ? "700" : "400"}>
                      {formDesc.length}/300
                    </Text>
                  </Flex>
                </Box>
              )}

              <Flex align="center" justify="flex-end" gap={3} flexWrap="wrap">
                {submitError && (
                  <Flex align="center" gap={2} px={4} py={2.5} borderRadius="10px"
                    style={{ background: "#fee2e2", border: "1px solid #fca5a5" }}>
                    <Text fontSize="xs" color="#b91c1c" fontWeight="700">⚠ {submitError}</Text>
                  </Flex>
                )}
                <button className="report-btn-fancy" onClick={handleSubmit} disabled={submitMutation.isPending} style={{
                  padding: "13px 30px", borderRadius: "14px", border: "none",
                  fontWeight: "800", fontSize: "14px",
                  cursor: submitMutation.isPending ? "not-allowed" : "pointer",
                  background: submitMutation.isPending ? "#94a3b8" : "linear-gradient(135deg, #ef4444, #b91c1c)",
                  color: "#fff", boxShadow: submitMutation.isPending ? "none" : "0 6px 24px rgba(239,68,68,0.45)",
                }}>
                  {submitMutation.isPending ? "Submitting…" : "Submit Report →"}
                </button>
              </Flex>
            </Box>
          )}

          {/* ══ MAP + FEED ══ */}
          <Grid templateColumns={{ base: "1fr", xl: "1fr 1fr" }} gap={7} alignItems="start">

            {/* MAP */}
            <Box borderRadius="28px" overflow="hidden" style={{
              boxShadow: "0 12px 48px rgba(0,0,0,0.14)",
              border: "1px solid rgba(226,232,240,0.6)",
              animation: "slideUpFade 0.55s 0.2s both",
            }}>
              <Box px={6} py={5} style={{
                background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #0c4a6e 100%)",
                backgroundSize: "200% 200%", animation: "gradientShift 8s ease infinite",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
              }}>
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
                  <Box px={4} py={2.5} borderRadius="12px" mt={3}
                    style={{ background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.35)" }}>
                    <Text fontSize="xs" color="#fca5a5" fontWeight="600">
                      📍 Click anywhere on the map to pin your report location — coordinates update automatically
                    </Text>
                  </Box>
                )}
              </Box>

              {isLoaded ? (
                <GoogleMap
                  mapContainerStyle={{ width: "100%", height: "480px" }}
                  center={mapCenter} zoom={12}
                  onClick={showForm ? handleMapClick : undefined}
                  options={{
                    styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
                    disableDefaultUI: false, zoomControl: true,
                    streetViewControl: false, fullscreenControl: true,
                  }}
                >
                  {showForm && (
                    <Marker position={{ lat: formLat, lng: formLon }}
                      icon={{
                        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
                          `<svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 28 18 28s18-14.5 18-28C36 8.06 27.94 0 18 0z" fill="#ef4444"/>
                            <circle cx="18" cy="18" r="10" fill="white"/>
                            <text x="18" y="23" text-anchor="middle" font-size="12" font-family="sans-serif">📍</text>
                          </svg>`
                        )}`,
                        scaledSize: new google.maps.Size(36, 46),
                      }} />
                  )}
                  {filtered.map((d) => (
                    <Marker key={d.id} position={{ lat: d.lat, lng: d.lon }}
                      icon={markerIcon(d.category, d.upvotes)}
                      onClick={() => setSelectedMarker(d)} />
                  ))}
                  {selectedMarker && (
                    <InfoWindow position={{ lat: selectedMarker.lat, lng: selectedMarker.lon }}
                      onCloseClick={() => setSelectedMarker(null)}>
                      <Box p={2} maxW="260px">
                        <Flex align="center" gap={2} mb={2}>
                          <Box w="32px" h="32px" borderRadius="8px" display="flex" alignItems="center"
                            justifyContent="center" fontSize="1rem" flexShrink={0}
                            style={{
                              background: `${getCategoryInfo(selectedMarker.category).color}18`,
                              border: `1.5px solid ${getCategoryInfo(selectedMarker.category).color}30`,
                            }}>
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
                        {selectedMarker.photo_url && (
                          <Box mb={2} style={{ textAlign: "center" }}>
                            <img src={selectedMarker.photo_url} alt="Report photo"
                              style={{
                                display: "block", margin: "0 auto",
                                maxWidth: "100%", width: "auto",
                                maxHeight: "150px", height: "auto",
                                borderRadius: "8px",
                              }} />
                          </Box>
                        )}
                        {selectedMarker.description && (
                          <Text fontSize="sm" color={PRIMARY} mb={2} lineHeight="1.5">{selectedMarker.description}</Text>
                        )}
                        <Flex align="center" justify="space-between">
                          <Text fontSize="0.68rem" color={SUBTLE}>{timeAgo(selectedMarker.minutes_ago, selectedMarker.reported_at)}</Text>
                          <Flex align="center" gap={1} px={2} py={0.5} borderRadius="full"
                            style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                            <Text fontSize="0.68rem" color="#16a34a" fontWeight="700">
                              👍 {selectedMarker.upvotes} confirmed
                            </Text>
                          </Flex>
                        </Flex>
                        <Text fontSize="0.65rem" color={MUTED} mt={1}>
                          💬 {selectedMarker.comment_count} comment{selectedMarker.comment_count !== 1 ? "s" : ""}
                        </Text>
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

            {/* FEED */}
            <Box style={{ animation: "slideUpFade 0.55s 0.3s both" }}>
              <Flex align="center" justify="space-between" mb={5}>
                <Box>
                  <Text fontSize="0.6rem" color={MUTED} fontWeight="700" letterSpacing="1.5px" textTransform="uppercase" mb={1}>
                    Community Reports
                  </Text>
                  <Heading size="lg" color={PRIMARY} fontWeight="900">Live Feed</Heading>
                </Box>
                <Flex align="center" gap={2} px={4} py={2} borderRadius="full" style={{
                  background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
                  border: "1px solid #bbf7d0", boxShadow: "0 2px 10px rgba(16,185,129,0.15)",
                }}>
                  <Box w="7px" h="7px" borderRadius="full" bg={GREEN}
                    style={{ animation: "pulseRing 2s ease-in-out infinite" }} />
                  <Text fontSize="xs" color="#16a34a" fontWeight="700">Auto-refreshing</Text>
                </Flex>
              </Flex>

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
                <Box textAlign="center" py={14} borderRadius="28px"
                  style={{ background: "linear-gradient(135deg, #f0fdf4, #ecfdf5)", border: "1.5px dashed #6ee7b7" }}>
                  <Text fontSize="3.5rem" mb={3}>🙌</Text>
                  <Text fontWeight="800" color={PRIMARY} fontSize="lg" mb={1}>All Clear!</Text>
                  <Text fontSize="sm" color={MUTED} maxW="280px" mx="auto" lineHeight="1.65">
                    No disruptions near you. Be the first to report if you spot something.
                  </Text>
                </Box>
              ) : (
                <VStack gap={3} align="stretch" maxH="640px" overflowY="auto"
                  className="feed-scroll" style={{ scrollbarWidth: "thin" }}>
                  {filtered.map((d, idx) => {
                    const cat = getCategoryInfo(d.category)
                    const alreadyUpvoted = upvotedIds.has(d.id)
                    const alreadyVotedResolve = resolveVotedIds.has(d.id)
                    const isTrending = d.upvotes >= 3
                    const isNew = d.minutes_ago < 10
                    const commentsOpen = expandedComments.has(d.id)
                    const resolveProgress = d.resolve_votes

                    return (
                      <Box key={d.id} className="community-report-card" style={{
                        animation: `floatIn 0.42s ${Math.min(idx * 0.06, 0.36)}s cubic-bezier(0.22,1,0.36,1) both`,
                        background: getCatGradient(cat.color),
                        border: `1.5px solid ${cat.color}22`,
                        borderLeft: `4px solid ${cat.color}`,
                        borderRadius: "20px", padding: "16px 18px",
                        boxShadow: isTrending ? `0 4px 20px ${cat.color}22` : "0 2px 10px rgba(0,0,0,0.05)",
                      }}>
                        <Flex align="flex-start" gap={3}>
                          <Flex w="48px" h="48px" borderRadius="14px" flexShrink={0}
                            align="center" justify="center" fontSize="1.5rem"
                            style={{
                              background: `linear-gradient(135deg, ${cat.color}22, ${cat.color}08)`,
                              border: `1.5px solid ${cat.color}30`,
                              boxShadow: `0 4px 14px ${cat.color}25`,
                            }}>
                            {cat.emoji}
                          </Flex>
                          <Box flex={1} minW={0}>
                            {/* Badges */}
                            <Flex align="center" gap={1.5} mb={1.5} flexWrap="wrap">
                              <Box px={2.5} py={0.5} borderRadius="full" fontSize="0.62rem" fontWeight="800"
                                style={{ background: `${cat.color}18`, color: cat.color, border: `1px solid ${cat.color}30`, letterSpacing: "0.03em" }}>
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
                              {d.photo_url && (
                                <Box px={2.5} py={0.5} borderRadius="full" fontSize="0.62rem" fontWeight="800"
                                  style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
                                  📷 Photo
                                </Box>
                              )}
                            </Flex>

                            {d.location_name && (
                              <Text fontSize="0.7rem" color={MUTED} fontWeight="600" mb={0.5}
                                style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                📍 {d.location_name}
                              </Text>
                            )}

                            {d.photo_url && (
                              <Box mb={2}>
                                <img src={d.photo_url} alt="Report photo"
                                  style={{
                                    display: "block", margin: "0 auto",
                                    maxWidth: "100%", width: "auto",
                                    maxHeight: "280px", height: "auto",
                                    borderRadius: "10px",
                                    border: `1px solid ${cat.color}22`,
                                  }} />
                              </Box>
                            )}

                            {d.description && (
                              <Text fontSize="sm" color={PRIMARY} lineHeight="1.55" mb={2}
                                style={{ display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
                                {d.description}
                              </Text>
                            )}

                            {/* Footer row */}
                            <Flex align="center" justify="space-between" flexWrap="wrap" gap={2}>
                              <Text fontSize="0.68rem" color={SUBTLE} fontWeight="600">{timeAgo(d.minutes_ago, d.reported_at)}</Text>
                              <Flex gap={2} flexWrap="wrap">

                                {/* Comment toggle */}
                                <button className="comment-toggle" onClick={() => toggleComments(d.id)} style={{
                                  padding: "5px 12px", borderRadius: "999px",
                                  border: `1.5px solid ${commentsOpen ? cat.color : BORDER}`,
                                  fontWeight: "700", fontSize: "12px", cursor: "pointer",
                                  background: commentsOpen ? `${cat.color}15` : CARD,
                                  color: commentsOpen ? cat.color : MUTED,
                                  boxShadow: commentsOpen ? `0 2px 10px ${cat.color}25` : "0 1px 4px rgba(0,0,0,0.06)",
                                }}>
                                  💬 {d.comment_count > 0 ? d.comment_count : ""} {commentsOpen ? "Hide" : "Comment"}
                                </button>

                                {/* Upvote */}
                                <button className="upvote-btn"
                                  onClick={() => !alreadyUpvoted && upvoteMutation.mutate(d.id)}
                                  style={{
                                    padding: "5px 14px", borderRadius: "999px",
                                    border: `1.5px solid ${alreadyUpvoted ? "#16a34a" : BORDER}`,
                                    fontWeight: "700", fontSize: "12px",
                                    cursor: alreadyUpvoted ? "default" : "pointer",
                                    background: alreadyUpvoted ? "linear-gradient(135deg, #dcfce7, #bbf7d0)" : CARD,
                                    color: alreadyUpvoted ? "#16a34a" : MUTED,
                                    boxShadow: alreadyUpvoted ? "0 2px 10px rgba(16,185,129,0.25)" : "0 1px 4px rgba(0,0,0,0.06)",
                                  }}>
                                  👍 {d.upvotes}&nbsp;
                                  <span style={{ opacity: 0.75 }}>{alreadyUpvoted ? "· Confirmed!" : "· Confirm"}</span>
                                </button>

                                {/* Consensus resolve — 5 votes needed */}
                                <button
                                  className="resolve-btn"
                                  disabled={alreadyVotedResolve}
                                  onClick={() => {
                                    if (alreadyVotedResolve) return
                                    resolveMutation.mutate(d.id)
                                  }}
                                  title={alreadyVotedResolve
                                    ? "You've already voted to resolve this"
                                    : `${RESOLVE_THRESHOLD - resolveProgress} more vote${RESOLVE_THRESHOLD - resolveProgress !== 1 ? "s" : ""} needed to resolve`
                                  }
                                  style={{
                                    padding: "5px 12px", borderRadius: "999px",
                                    border: `1.5px solid ${alreadyVotedResolve ? "#16a34a" : resolveProgress > 0 ? "#f59e0b" : BORDER}`,
                                    fontWeight: "700", fontSize: "12px",
                                    cursor: alreadyVotedResolve ? "default" : "pointer",
                                    background: alreadyVotedResolve
                                      ? "#f0fdf4"
                                      : resolveProgress > 0
                                        ? "#fffbeb"
                                        : CARD,
                                    color: alreadyVotedResolve
                                      ? "#16a34a"
                                      : resolveProgress > 0
                                        ? "#92400e"
                                        : MUTED,
                                    boxShadow: resolveProgress > 0 ? "0 2px 8px rgba(245,158,11,0.2)" : "0 1px 4px rgba(0,0,0,0.06)",
                                  }}>
                                  ✅ {resolveProgress}/{RESOLVE_THRESHOLD}&nbsp;
                                  <span style={{ opacity: 0.75 }}>
                                    {alreadyVotedResolve ? "· Voted" : "· Resolved?"}
                                  </span>
                                </button>

                              </Flex>
                            </Flex>

                            {/* Inline comment section */}
                            {commentsOpen && <CommentSection report={d} cat={cat} />}
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