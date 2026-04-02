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
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
})

function Dashboard() {
  const { user: currentUser } = useAuth()

  return (
    <Container maxW="full" p={6}>
      {/* Header */}
      <Box mb={6}>
        <Heading size="2xl" mb={2}>
          Intelligence Dashboard
        </Heading>
        <Text color="gray.500">
          Hi, {currentUser?.full_name || currentUser?.email} - Welcome back to CityNexus
        </Text>
      </Box>

      <VStack gap={6} align="stretch">
        {/* SECTION 1 - Route Input Bar */}
        <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
          <Grid templateColumns="repeat(4, 1fr)" gap={4}>
            <Field label="PICKUP">
              <Input
                placeholder="Gachibowli"
                bg="bg"
                borderColor="border"
                _focus={{ borderColor: "blue.500" }}
              />
            </Field>
            <Field label="DESTINATION">
              <Input
                placeholder="Hitech City"
                bg="bg"
                borderColor="border"
                _focus={{ borderColor: "blue.500" }}
              />
            </Field>
            <Field label="PASSENGERS">
              <Input
                type="number"
                defaultValue="2"
                bg="bg"
                borderColor="border"
                _focus={{ borderColor: "blue.500" }}
              />
            </Field>
            <Flex alignItems="flex-end">
              <Button w="100%" size="lg" variant="solid">
                Analyse Route
              </Button>
            </Flex>
          </Grid>
        </Box>

        {/* SECTION 2 - Four Stat Cards */}
        <Grid templateColumns="repeat(4, 1fr)" gap={4}>
          {/* Cancellation Risk */}
          <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
            <Text fontSize="xs" color="gray.500" fontWeight="bold" mb={3}>
              CANCELLATION RISK
            </Text>
            <Text fontSize="4xl" fontWeight="bold" color="red.500" mb={2}>
              HIGH
            </Text>
            <Text fontSize="sm" color="gray.500">
              78% probability
            </Text>
          </Box>

          {/* Real Wait Time */}
          <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
            <Text fontSize="xs" color="gray.500" fontWeight="bold" mb={3}>
              REAL WAIT TIME
            </Text>
            <Text fontSize="4xl" fontWeight="bold" mb={2}>
              18 min
            </Text>
            <Text fontSize="sm" color="gray.500">
              App shows 4 min
            </Text>
          </Box>

          {/* Best Mode Now */}
          <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
            <Text fontSize="xs" color="gray.500" fontWeight="bold" mb={3}>
              BEST MODE NOW
            </Text>
            <Text fontSize="4xl" fontWeight="bold" color="green.500" mb={2}>
              Metro
            </Text>
            <Text fontSize="sm" color="gray.500">
              Saves ₹155 · 6 min faster
            </Text>
          </Box>

          {/* Weather Impact */}
          <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
            <Text fontSize="xs" color="gray.500" fontWeight="bold" mb={3}>
              WEATHER IMPACT
            </Text>
            <Text fontSize="4xl" fontWeight="bold" color="orange.400" mb={2}>
              Rain
            </Text>
            <Text fontSize="sm" color="gray.500">
              +30% risk adjustment
            </Text>
          </Box>
        </Grid>

        {/* SECTION 3 - Two Columns */}
        <Grid templateColumns="2fr 1fr" gap={6}>
          {/* Left Column - Transport Alternatives */}
          <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
            <Heading size="sm" color="gray.500" mb={4}>
              TRANSPORT ALTERNATIVES
            </Heading>
            <VStack gap={3} align="stretch">
              {/* Metro - Recommended */}
              <Box
                bg="bg"
                borderWidth="2px"
                borderColor="green.500"
                borderRadius="lg"
                p={4}
              >
                <Flex alignItems="center" gap={4}>
                  <Text fontSize="3xl">🚇</Text>
                  <Box flex="1">
                    <Flex alignItems="center" gap={2} mb={1}>
                      <Text fontWeight="bold">Metro</Text>
                      <Box
                        px={2}
                        py={0.5}
                        bg="green.600"
                        color="green.100"
                        fontSize="xs"
                        borderRadius="full"
                        fontWeight="medium"
                      >
                        Recommended
                      </Box>
                    </Flex>
                    <Text fontSize="sm" color="gray.500">
                      Walk 280m to Hitech City Station
                    </Text>
                  </Box>
                  <Box textAlign="right">
                    <Text fontSize="xl" fontWeight="bold" color="green.500">
                      ₹25
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      12 min
                    </Text>
                  </Box>
                </Flex>
              </Box>

              {/* Auto */}
              <Box bg="bg" borderWidth="1px" borderRadius="lg" p={4}>
                <Flex alignItems="center" gap={4}>
                  <Text fontSize="3xl">🛺</Text>
                  <Box flex="1">
                    <Text fontWeight="bold" mb={1}>
                      Auto
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      Low cancellation risk · 2 nearby
                    </Text>
                  </Box>
                  <Box textAlign="right">
                    <Text fontSize="xl" fontWeight="bold">
                      ₹85
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      16 min
                    </Text>
                  </Box>
                </Flex>
              </Box>

              {/* Bus */}
              <Box bg="bg" borderWidth="1px" borderRadius="lg" p={4}>
                <Flex alignItems="center" gap={4}>
                  <Text fontSize="3xl">🚌</Text>
                  <Box flex="1">
                    <Text fontWeight="bold" mb={1}>
                      Bus · Route 216
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      Stop 150m away · Direct route
                    </Text>
                  </Box>
                  <Box textAlign="right">
                    <Text fontSize="xl" fontWeight="bold">
                      ₹15
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      22 min
                    </Text>
                  </Box>
                </Flex>
              </Box>

              {/* Cab - High Risk */}
              <Box
                bg="bg"
                borderWidth="2px"
                borderColor="red.500"
                borderRadius="lg"
                p={4}
              >
                <Flex alignItems="center" gap={4}>
                  <Text fontSize="3xl">🚗</Text>
                  <Box flex="1">
                    <Text fontWeight="bold" mb={1}>
                      Cab
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      High cancellation risk · Surge 1.8x
                    </Text>
                  </Box>
                  <Box textAlign="right">
                    <Text fontSize="xl" fontWeight="bold">
                      ₹180
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      18+ min
                    </Text>
                  </Box>
                </Flex>
              </Box>
            </VStack>
          </Box>

          {/* Right Column - Two Stacked Cards */}
          <VStack gap={6} align="stretch">
            {/* Route Reliability */}
            <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
              <Heading size="xs" color="gray.500" mb={4}>
                ROUTE RELIABILITY
              </Heading>
              <Box mb={4}>
                <Text fontSize="5xl" fontWeight="bold" color="orange.400" mb={1}>
                  4.2
                </Text>
                <Text fontSize="sm" color="gray.500">
                  out of 10 · This Route
                </Text>
              </Box>
              <VStack gap={3} align="stretch">
                <Box>
                  <Flex justify="space-between" fontSize="sm" mb={1}>
                    <Text color="gray.400">Cancellations</Text>
                    <Text fontWeight="bold">78%</Text>
                  </Flex>
                  <Box h="1.5" bg="bg" borderRadius="full" overflow="hidden">
                    <Box h="100%" bg="red.500" borderRadius="full" w="78%" />
                  </Box>
                </Box>
                <Box>
                  <Flex justify="space-between" fontSize="sm" mb={1}>
                    <Text color="gray.400">Surge Freq</Text>
                    <Text fontWeight="bold">65%</Text>
                  </Flex>
                  <Box h="1.5" bg="bg" borderRadius="full" overflow="hidden">
                    <Box h="100%" bg="orange.500" borderRadius="full" w="65%" />
                  </Box>
                </Box>
                <Box>
                  <Flex justify="space-between" fontSize="sm" mb={1}>
                    <Text color="gray.400">Avg Wait</Text>
                    <Text fontWeight="bold">45%</Text>
                  </Flex>
                  <Box h="1.5" bg="bg" borderRadius="full" overflow="hidden">
                    <Box h="100%" bg="yellow.500" borderRadius="full" w="45%" />
                  </Box>
                </Box>
                <Box>
                  <Flex justify="space-between" fontSize="sm" mb={1}>
                    <Text color="gray.400">Driver Supply</Text>
                    <Text fontWeight="bold">32%</Text>
                  </Flex>
                  <Box h="1.5" bg="bg" borderRadius="full" overflow="hidden">
                    <Box h="100%" bg="red.500" borderRadius="full" w="32%" />
                  </Box>
                </Box>
              </VStack>
            </Box>

            {/* Weekly Commute Plan */}
            <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
              <Heading size="xs" color="gray.500" mb={4}>
                WEEKLY COMMUTE PLAN
              </Heading>
              <VStack gap={2} align="stretch">
                {/* Days Header */}
                <Grid templateColumns="repeat(7, 1fr)" gap={1} fontSize="xs" color="gray.500" textAlign="center" mb={2}>
                  <Box>MON</Box>
                  <Box>TUE</Box>
                  <Box>WED</Box>
                  <Box>THU</Box>
                  <Box>FRI</Box>
                  <Box>SAT</Box>
                  <Box>SUN</Box>
                </Grid>

                {/* Morning Slot */}
                <Grid templateColumns="repeat(7, 1fr)" gap={1}>
                  <Box bg="teal.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">MTR</Box>
                  <Box bg="teal.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">MTR</Box>
                  <Box bg="blue.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">CAB</Box>
                  <Box bg="teal.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">MTR</Box>
                  <Box bg="teal.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">MTR</Box>
                  <Box bg="amber.700" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">BUS</Box>
                  <Box bg="amber.700" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">BUS</Box>
                </Grid>

                {/* Afternoon Slot */}
                <Grid templateColumns="repeat(7, 1fr)" gap={1}>
                  <Box bg="blue.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">CAB</Box>
                  <Box bg="teal.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">MTR</Box>
                  <Box bg="red.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">HI</Box>
                  <Box bg="blue.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">CAB</Box>
                  <Box bg="red.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">HI</Box>
                  <Box bg="teal.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">MTR</Box>
                  <Box bg="amber.700" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">BUS</Box>
                </Grid>

                {/* Evening Slot */}
                <Grid templateColumns="repeat(7, 1fr)" gap={1}>
                  <Box bg="teal.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">MTR</Box>
                  <Box bg="amber.700" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">BUS</Box>
                  <Box bg="teal.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">MTR</Box>
                  <Box bg="teal.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">MTR</Box>
                  <Box bg="blue.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">CAB</Box>
                  <Box bg="red.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">HI</Box>
                  <Box bg="teal.600" color="white" fontSize="xs" py={2} borderRadius="md" textAlign="center" fontWeight="medium">MTR</Box>
                </Grid>
              </VStack>

              {/* Legend */}
              <Flex flexWrap="wrap" gap={2} mt={4} fontSize="xs">
                <Box px={2} py={1} bg="teal.600" color="white" borderRadius="md">Metro</Box>
                <Box px={2} py={1} bg="blue.600" color="white" borderRadius="md">Cab</Box>
                <Box px={2} py={1} bg="amber.700" color="white" borderRadius="md">Bus</Box>
                <Box px={2} py={1} bg="red.600" color="white" borderRadius="md">High Risk</Box>
              </Flex>
            </Box>
          </VStack>
        </Grid>

        {/* SECTION 4 - Best Time to Leave */}
        <Box bg="bg.subtle" borderRadius="xl" p={6} borderWidth="1px">
          <Heading size="sm" color="gray.500" mb={6}>
            BEST TIME TO LEAVE
          </Heading>

          {/* Bar Chart */}
          <Flex alignItems="flex-end" justify="space-between" gap={3} h="48" mb={6}>
            <VStack flex="1" h="100%" justify="flex-end" gap={2}>
              <Box w="100%" bg="red.500" borderRadius="md" h="85%" />
              <Text fontSize="xs" color="gray.500">6PM</Text>
            </VStack>
            <VStack flex="1" h="100%" justify="flex-end" gap={2}>
              <Box w="100%" bg="red.500" borderRadius="md" h="90%" />
              <Text fontSize="xs" color="gray.500">6:15</Text>
            </VStack>
            <VStack flex="1" h="100%" justify="flex-end" gap={2}>
              <Box w="100%" bg="red.400" borderRadius="md" h="75%" />
              <Text fontSize="xs" color="gray.500">6:30</Text>
            </VStack>
            <VStack flex="1" h="100%" justify="flex-end" gap={2}>
              <Box w="100%" bg="orange.400" borderRadius="md" h="60%" />
              <Text fontSize="xs" color="gray.500">6:45</Text>
            </VStack>
            <VStack flex="1" h="100%" justify="flex-end" gap={2}>
              <Box w="100%" bg="yellow.400" borderRadius="md" h="45%" />
              <Text fontSize="xs" color="gray.500">7PM</Text>
            </VStack>
            <VStack flex="1" h="100%" justify="flex-end" gap={2}>
              <Box w="100%" bg="green.500" borderRadius="md" h="25%" />
              <Text fontSize="xs" color="gray.500">7:15</Text>
            </VStack>
            <VStack flex="1" h="100%" justify="flex-end" gap={2}>
              <Box w="100%" bg="green.500" borderRadius="md" h="30%" />
              <Text fontSize="xs" color="gray.500">7:30</Text>
            </VStack>
            <VStack flex="1" h="100%" justify="flex-end" gap={2}>
              <Box w="100%" bg="green.400" borderRadius="md" h="35%" />
              <Text fontSize="xs" color="gray.500">7:45</Text>
            </VStack>
          </Flex>

          {/* Recommendation Box */}
          <Box bg="green.600/20" borderWidth="1px" borderColor="green.500" borderRadius="lg" p={4}>
            <Text color="green.400" fontWeight="medium">
              Leave at 7:15 PM — cancellation risk drops to Low, save ₹155
            </Text>
          </Box>
        </Box>
      </VStack>
    </Container>
  )
}
