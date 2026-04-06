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
  type WeeklyPlanRequest,
  geocode,
  getWeeklyPlan,
} from "@/lib/api"

export const Route = createFileRoute("/_layout/weekly")({
  component: WeeklyPage,
})

const MODE_EMOJI: Record<string, string> = {
  metro: "🚇",
  bus: "🚌",
  auto: "🛺",
  cab: "🚗",
  cab_mini: "🚗",
  cab_sedan: "🚗",
  cab_suv: "🚗",
  bike: "🛵",
}

function getRiskPalette(level: string) {
  if (level === "low") return "green"
  if (level === "moderate") return "orange"
  return "red"
}

function getRiskBg(level: string) {
  if (level === "low") return "#48bb78"
  if (level === "moderate") return "#ed8936"
  return "#e53e3e"
}

function WeeklyPage() {
  const [pickupText, setPickupText] = useState("")
  const [destText, setDestText] = useState("")
  const [passengers, setPassengers] = useState(1)
  const [departureTime, setDepartureTime] = useState("08:30")
  const [planRequest, setPlanRequest] = useState<WeeklyPlanRequest | null>(null)
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
      setPlanRequest({
        origin_lat: pickup.lat,
        origin_lon: pickup.lon,
        dest_lat: dest.lat,
        dest_lon: dest.lon,
        passengers,
        departure_time: departureTime,
      })
    } catch (e: unknown) {
      setGeoError(
        e instanceof Error ? e.message : "Could not geocode locations",
      )
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

  // Find cheapest day and riskiest day
  const cheapestDay = plan?.weekly_plan.reduce((a, b) =>
    a.cost_inr < b.cost_inr ? a : b,
  )
  const riskiestDay = plan?.weekly_plan
    .slice()
    .sort((a, b) => {
      const order = { high: 0, moderate: 1, low: 2 }
      return (
        (order[a.risk_level as keyof typeof order] ?? 1) -
        (order[b.risk_level as keyof typeof order] ?? 1)
      )
    })[0]

  const chartData = plan?.weekly_plan.map((d) => ({
    day: d.day_name.slice(0, 3),
    cost: Math.round(d.cost_inr),
    isCheapest: d === cheapestDay,
  }))

  return (
    <Container maxW="full" p={6}>
      <Box mb={6}>
        <Heading size="2xl" mb={2}>
          Weekly Commute Planner
        </Heading>
        <Text color="gray.500">
          Get a 7-day optimised commute plan with cost and risk breakdown
        </Text>
      </Box>

      <VStack gap={6} align="stretch">
        {/* ── Input Form ── */}
        <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
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
              />
            </Field>
            <Field label="DESTINATION">
              <Input
                placeholder="e.g. Gachibowli"
                value={destText}
                onChange={(e) => setDestText(e.target.value)}
                bg="bg"
              />
            </Field>
            <Field label="PAX">
              <Input
                type="number"
                min={1}
                max={6}
                value={passengers}
                onChange={(e) => setPassengers(Number(e.target.value))}
                bg="bg"
              />
            </Field>
            <Field label="DEPARTURE">
              <Input
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                bg="bg"
              />
            </Field>
            <Button
              onClick={handleSubmit}
              loading={isGeocoding}
              size="lg"
              mt={4}
            >
              Plan My Week
            </Button>
          </Grid>
          {geoError && (
            <Text color="red.400" mt={2} fontSize="sm">
              {geoError}
            </Text>
          )}
        </Box>

        {!planRequest ? (
          <Box
            bg="bg.subtle"
            borderRadius="xl"
            p={12}
            borderWidth="1px"
            textAlign="center"
          >
            <Text fontSize="5xl" mb={4}>
              📅
            </Text>
            <Heading size="lg" mb={2}>
              Enter your daily commute above
            </Heading>
            <Text color="gray.500">
              Get mode recommendations, costs, and risk levels for every day of
              the week
            </Text>
          </Box>
        ) : weeklyQuery.isLoading ? (
          <VStack gap={4}>
            <Skeleton h="100px" />
            <Skeleton h="300px" />
            <Skeleton h="200px" />
          </VStack>
        ) : plan ? (
          <>
            {/* ── Summary Banner ── */}
            <Grid
              templateColumns={{ base: "1fr 1fr", md: "repeat(4, 1fr)" }}
              gap={4}
            >
              <Box bg="bg.subtle" borderRadius="xl" p={4} borderWidth="1px">
                <Text fontSize="xs" color="gray.500" fontWeight="bold" mb={1}>
                  BEST MODE
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
                  ₹{Math.round(plan.total_estimated_cost_inr)}
                </Text>
              </Box>
              <Box bg="bg.subtle" borderRadius="xl" p={4} borderWidth="1px">
                <Text fontSize="xs" color="gray.500" fontWeight="bold" mb={1}>
                  CHEAPEST DAY
                </Text>
                <Flex align="center" gap={2}>
                  <Badge colorPalette="green">{cheapestDay?.day_name}</Badge>
                  <Text fontWeight="bold">
                    ₹{cheapestDay ? Math.round(cheapestDay.cost_inr) : "-"}
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
                  <Text>DAY</Text>
                  <Text>DATE</Text>
                  <Text>MODE & REASON</Text>
                  <Text textAlign="right">COST</Text>
                  <Text textAlign="right">TIME</Text>
                  <Text textAlign="center">RISK</Text>
                </Grid>
                {plan.weekly_plan.map((day, i) => (
                  <Grid
                    key={i}
                    templateColumns="100px 90px 1fr 80px 70px 90px"
                    gap={3}
                    px={4}
                    py={3}
                    alignItems="center"
                    borderBottomWidth="1px"
                    _hover={{ bg: "bg" }}
                    bg={day === cheapestDay ? "green.500/5" : undefined}
                  >
                    <Flex align="center" gap={2}>
                      <Text fontSize="lg">
                        {MODE_EMOJI[day.recommended_mode] || "🚌"}
                      </Text>
                      <Text fontWeight="medium" fontSize="sm">
                        {day.day_name.slice(0, 3)}
                      </Text>
                    </Flex>
                    <Text fontSize="sm" color="gray.500">
                      {day.date}
                    </Text>
                    <Box>
                      <Text
                        fontSize="sm"
                        fontWeight="medium"
                        textTransform="capitalize"
                      >
                        {day.recommended_mode}
                        {day.variant ? ` (${day.variant})` : ""}
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        {day.reason}
                      </Text>
                    </Box>
                    <Text textAlign="right" fontWeight="bold">
                      ₹{Math.round(day.cost_inr)}
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

            {/* ── Cost Bar Chart ── */}
            <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
              <Heading size="sm" color="gray.500" mb={4}>
                DAILY COST
              </Heading>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={chartData}
                  margin={{ left: 10, right: 10, top: 5, bottom: 5 }}
                >
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "#888", fontSize: 12 }}
                  />
                  <YAxis
                    tick={{ fill: "#888", fontSize: 12 }}
                    tickFormatter={(v: number) => `₹${v}`}
                  />
                  <Tooltip formatter={(v) => [`₹${v ?? ''}`, "Cost"]} />
                  <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                    {chartData?.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.isCheapest ? "#48bb78" : "#4299e1"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <Text fontSize="xs" color="gray.500" textAlign="center" mt={1}>
                Green = cheapest day
              </Text>
            </Box>

            {/* ── Risk Strip ── */}
            <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
              <Heading size="sm" color="gray.500" mb={4}>
                WEEKLY RISK OVERVIEW
              </Heading>
              <Flex gap={2}>
                {plan.weekly_plan.map((day, i) => (
                  <Box
                    key={i}
                    flex="1"
                    bg={getRiskBg(day.risk_level)}
                    borderRadius="md"
                    p={3}
                    textAlign="center"
                  >
                    <Text fontSize="xs" color="white" fontWeight="bold">
                      {day.day_name.slice(0, 3)}
                    </Text>
                    <Text fontSize="xs" color="white" textTransform="capitalize">
                      {day.risk_level}
                    </Text>
                  </Box>
                ))}
              </Flex>
            </Box>
          </>
        ) : null}
      </VStack>
    </Container>
  )
}
