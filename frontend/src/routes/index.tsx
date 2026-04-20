import { Box, Container, Flex, Grid, Heading, Text } from "@chakra-ui/react"
import { createFileRoute, Link as RouterLink, redirect } from "@tanstack/react-router"
import {
  FiClock,
  FiCloud,
  FiMap,
  FiMapPin,
  FiNavigation,
  FiCalendar,
} from "react-icons/fi"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/")({
  component: LandingPage,
  beforeLoad: () => {
    if (isLoggedIn()) {
      throw redirect({ to: "/dashboard" })
    }
  },
})

const FEATURES = [
  {
    icon: FiNavigation,
    title: "Cancellation Risk",
    desc: "Know your risk before you book",
  },
  {
    icon: FiMap,
    title: "Best Transport Mode",
    desc: "Metro, auto, bus or cab — we pick the best",
  },
  {
    icon: FiCloud,
    title: "Weather Impact",
    desc: "Rain means higher risk. We factor it in automatically",
  },
  {
    icon: FiMapPin,
    title: "Optimal Pickup Point",
    desc: "Walk 3 minutes, wait 10 minutes less",
  },
  {
    icon: FiClock,
    title: "Best Time To Leave",
    desc: "Green slots mean low risk and stable fares",
  },
  {
    icon: FiCalendar,
    title: "Weekly Commute Planner",
    desc: "Plan your whole week in one view",
  },
]

const HOW_IT_WORKS = [
  {
    n: "01",
    title: "Enter your route",
    desc: "Pickup, destination, passengers",
  },
  {
    n: "02",
    title: "We analyse",
    desc: "ML model, live weather, transport network",
  },
  {
    n: "03",
    title: "You decide",
    desc: "With full information, not blind booking",
  },
]

const BG = "#0a1628"
const CARD = "#112240"
const BORDER = "#1e3a5f"
const TEAL = "#00d4aa"
const BLUE = "#3b82f6"
const MUTED = "#94a3b8"

function LandingPage() {
  return (
    <Box minH="100vh" bg={BG} color="#ffffff">
      {/* ── Navbar ── */}
      <Box
        borderBottom={`1px solid ${BORDER}`}
        bg={BG}
        position="sticky"
        top={0}
        zIndex={100}
      >
        <Container maxW="6xl">
          <Flex h="64px" align="center" justify="space-between">
            <Flex align="baseline" gap={2}>
              <Text fontWeight="bold" fontSize="xl" color={TEAL} letterSpacing="tight">
                CityNexus
              </Text>
              <Text fontSize="xs" color={MUTED} letterSpacing="widest">
                RIDE INTELLIGENCE
              </Text>
            </Flex>
            <Flex gap={3}>
              <RouterLink to="/login">
                <Box
                  as="span"
                  display="inline-block"
                  px={4}
                  py={2}
                  borderRadius="lg"
                  border={`1px solid ${BORDER}`}
                  color={MUTED}
                  fontSize="sm"
                  cursor="pointer"
                  _hover={{ borderColor: TEAL, color: "#ffffff" }}
                >
                  Login
                </Box>
              </RouterLink>
              <RouterLink to="/signup">
                <Box
                  as="span"
                  display="inline-block"
                  px={4}
                  py={2}
                  borderRadius="lg"
                  bg={TEAL}
                  color="#0a1628"
                  fontWeight="bold"
                  fontSize="sm"
                  cursor="pointer"
                  _hover={{ opacity: 0.9 }}
                >
                  Get Started
                </Box>
              </RouterLink>
            </Flex>
          </Flex>
        </Container>
      </Box>

      {/* ── Hero ── */}
      <Box
        minH="calc(100vh - 64px)"
        display="flex"
        alignItems="center"
        justifyContent="center"
        textAlign="center"
        px={4}
        py={20}
      >
        <Box maxW="820px">
          <Text
            fontSize="xs"
            color={TEAL}
            fontWeight="bold"
            letterSpacing="widest"
            mb={4}
          >
            HYDERABAD · LIVE · 88% ACCURACY
          </Text>
          <Heading
            as="h1"
            fontSize={{ base: "4xl", md: "6xl" }}
            fontWeight="extrabold"
            lineHeight="1.1"
            mb={6}
          >
            Know Before{" "}
            <Box as="span" color={TEAL}>
              You Book
            </Box>
          </Heading>
          <Text
            fontSize={{ base: "lg", md: "xl" }}
            color={MUTED}
            maxW="600px"
            mx="auto"
            mb={10}
            lineHeight="1.7"
          >
            Predict cancellation risk, compare transport modes, and make smarter
            travel decisions — before you open Uber or Ola
          </Text>

          {/* CTA buttons */}
          <Flex gap={4} justify="center" wrap="wrap" mb={14}>
            <RouterLink to="/dashboard">
              <Box
                as="span"
                display="inline-block"
                px={8}
                py={4}
                borderRadius="xl"
                bg={TEAL}
                color="#0a1628"
                fontWeight="bold"
                fontSize="md"
                cursor="pointer"
                _hover={{ opacity: 0.9 }}
                boxShadow={`0 0 24px ${TEAL}40`}
              >
                Analyse My Route
              </Box>
            </RouterLink>
            <Box
              as="button"
              display="inline-block"
              px={8}
              py={4}
              borderRadius="xl"
              border={`1px solid ${TEAL}`}
              color={TEAL}
              fontWeight="bold"
              fontSize="md"
              cursor="pointer"
              bg="transparent"
              _hover={{ bg: `${TEAL}15` }}
              onClick={() =>
                document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })
              }
            >
              See How It Works
            </Box>
          </Flex>

          {/* Trust stats */}
          <Flex justify="center" gap={{ base: 6, md: 12 }} wrap="wrap">
            {[
              { value: "150K+", label: "Rides Analysed" },
              { value: "88%", label: "Prediction Accuracy" },
              { value: "Hyderabad · Live", label: "Coverage" },
            ].map((s) => (
              <Box key={s.label} textAlign="center">
                <Text fontWeight="bold" fontSize="lg" color="#ffffff">
                  {s.value}
                </Text>
                <Text fontSize="xs" color={MUTED}>
                  {s.label}
                </Text>
              </Box>
            ))}
          </Flex>
        </Box>
      </Box>

      {/* ── Features ── */}
      <Box py={20} px={4} bg={CARD} borderTop={`1px solid ${BORDER}`}>
        <Container maxW="6xl">
          <Text
            fontSize="xs"
            fontWeight="bold"
            letterSpacing="widest"
            color={TEAL}
            textAlign="center"
            mb={3}
          >
            WHAT WE ANALYSE
          </Text>
          <Heading textAlign="center" fontSize={{ base: "2xl", md: "3xl" }} mb={12}>
            Six signals. One decision.
          </Heading>
          <Grid
            templateColumns={{ base: "1fr", md: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }}
            gap={6}
          >
            {FEATURES.map((f) => (
              <Box
                key={f.title}
                bg={BG}
                border={`1px solid ${BORDER}`}
                borderRadius="xl"
                p={6}
                boxShadow="0 4px 20px rgba(0,0,0,0.3)"
                _hover={{ borderColor: TEAL }}
              >
                <Box
                  w="40px"
                  h="40px"
                  borderRadius="lg"
                  bg={`${TEAL}20`}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  mb={4}
                >
                  <Box as={f.icon} color={TEAL} fontSize="18px" />
                </Box>
                <Text fontWeight="bold" fontSize="md" mb={1}>
                  {f.title}
                </Text>
                <Text fontSize="sm" color={MUTED}>
                  {f.desc}
                </Text>
              </Box>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ── How It Works ── */}
      <Box id="how-it-works" py={20} px={4}>
        <Container maxW="6xl">
          <Text
            fontSize="xs"
            fontWeight="bold"
            letterSpacing="widest"
            color={BLUE}
            textAlign="center"
            mb={3}
          >
            HOW IT WORKS
          </Text>
          <Heading textAlign="center" fontSize={{ base: "2xl", md: "3xl" }} mb={12}>
            Three steps to smarter rides
          </Heading>
          <Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap={8}>
            {HOW_IT_WORKS.map((s) => (
              <Flex key={s.n} direction="column" align="center" textAlign="center">
                <Text
                  fontSize="5xl"
                  fontWeight="extrabold"
                  color={BORDER}
                  lineHeight="1"
                  mb={4}
                >
                  {s.n}
                </Text>
                <Text fontWeight="bold" fontSize="lg" mb={2}>
                  {s.title}
                </Text>
                <Text fontSize="sm" color={MUTED}>
                  {s.desc}
                </Text>
              </Flex>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ── Footer ── */}
      <Box borderTop={`1px solid ${BORDER}`} py={8} px={4} textAlign="center">
        <Text color={MUTED} fontSize="sm" mb={1}>
          CityNexus · Hyderabad · 2025
        </Text>
        <Text color={BORDER} fontSize="xs">
          Built for riders, not platforms
        </Text>
      </Box>
    </Box>
  )
}
