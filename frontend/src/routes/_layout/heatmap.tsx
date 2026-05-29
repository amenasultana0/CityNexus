import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import {
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
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

import {
  getOptimalPickup,
  PickupSuggestion,
} from "@/lib/api"

export const Route = createFileRoute("/_layout/heatmap")({
  component: HeatmapPage,
})

const LIBRARIES: ("places")[] = ["places"]

type LocationPoint = {
  lat: number
  lng: number
}

function HeatmapPage() {
  const [pickupText, setPickupText] = useState("")
  const [destText, setDestText] = useState("")

  const [origin, setOrigin] =
    useState<LocationPoint | null>(null)

  const [destination, setDestination] =
    useState<LocationPoint | null>(null)

  const [selectedStop, setSelectedStop] =
    useState<PickupSuggestion | null>(null)

  const [loadingStops, setLoadingStops] =
    useState(false)

  const [pickupStops, setPickupStops] =
    useState<PickupSuggestion[]>([])

  const [destinationStops, setDestinationStops] =
    useState<PickupSuggestion[]>([])
const [directions, setDirections] =
  useState<google.maps.DirectionsResult | null>(
    null,
  )

const [
  pickupStopRoutes,
  setPickupStopRoutes,
] = useState<
  google.maps.DirectionsResult[]
>([])

const [
  destinationStopRoutes,
  setDestinationStopRoutes,
] = useState<
  google.maps.DirectionsResult[]
>([])
  
  const mapRef =
    useRef<google.maps.Map | null>(null)

  const pickupRef =
    useRef<google.maps.places.Autocomplete | null>(null)

  const destRef =
    useRef<google.maps.places.Autocomplete | null>(null)

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey:
      import.meta.env.VITE_GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  })

  // Autofill from dashboard localStorage
  useEffect(() => {
    const stored =
      localStorage.getItem("tripData")

    if (!stored) return

    try {
      const trip = JSON.parse(stored)

      if (trip.pickupText) {
        setPickupText(trip.pickupText)
      }

      if (trip.destText) {
        setDestText(trip.destText)
      }

      if (
        trip.pickupLat &&
        trip.pickupLng
      ) {
        setOrigin({
          lat: trip.pickupLat,
          lng: trip.pickupLng,
        })
      }

      if (
        trip.destLat &&
        trip.destLng
      ) {
        setDestination({
          lat: trip.destLat,
          lng: trip.destLng,
        })
      }
    } catch (error) {
      console.error(
        "Failed to read tripData",
        error,
      )
    }
  }, [])

  // 1. Define fetchNearbyStops FIRST
const fetchNearbyStops = useCallback(async () => {
    if (!origin || !destination) return

    setLoadingStops(true)

    try {
      const [pickupResult, destinationResult] =
        await Promise.all([
          getOptimalPickup({
            origin_lat: origin.lat,
            origin_lon: origin.lng,
            radius_m: 1500,
          }),
          getOptimalPickup({
            origin_lat: destination.lat,
            origin_lon: destination.lng,
            radius_m: 1500,
          }),
        ])

      const allowedStops = ["metro", "bus", "mmts"]

      setPickupStops(
        pickupResult.suggestions.filter((stop) =>
          allowedStops.includes(stop.stop_type)
        )
      )
      setDestinationStops(
        destinationResult.suggestions.filter((stop) =>
          allowedStops.includes(stop.stop_type)
        )
      )
    } catch (error) {
      console.error("Failed loading transit stops", error)
    } finally {
      setLoadingStops(false)
    }
}, [origin, destination])

// 2. THEN the useEffect that uses it
useEffect(() => {
    if (origin && destination) {
      fetchNearbyStops()
    }
}, [origin, destination, fetchNearbyStops])

  // Auto zoom map to route
  useEffect(() => {
    if (
      !mapRef.current ||
      !origin ||
      !destination
    )
      return

    const bounds =
      new google.maps.LatLngBounds()

    bounds.extend(origin)
    bounds.extend(destination)

    mapRef.current.fitBounds(bounds)
  }, [origin, destination])


  useEffect(() => {
  if (!origin || !destination || !isLoaded) return
  if (pickupStops.length === 0 && destinationStops.length === 0) return

  const run = async () => {
    const directionsService = new google.maps.DirectionsService()

    // MAIN ROUTE
    directionsService.route(
      {
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === "OK" && result) {
          setDirections(result)
        }
      },
    )

    // PICKUP → STOPS (with delay)
    const pickupResults: (google.maps.DirectionsResult | null)[] = []
    for (const stop of pickupStops) {
      await new Promise(resolve => setTimeout(resolve, 200))
      const result = await new Promise<google.maps.DirectionsResult | null>((resolve) => {
        directionsService.route(
          {
            origin,
            destination: { lat: stop.lat, lng: stop.lon },
            travelMode: google.maps.TravelMode.WALKING,
          },
          (result, status) => {
            resolve(status === "OK" && result ? result : null)
          },
        )
      })
      pickupResults.push(result)
    }
    setPickupStopRoutes(
      pickupResults.filter(Boolean) as google.maps.DirectionsResult[]
    )

    // DESTINATION → STOPS (with delay)
    const destResults: (google.maps.DirectionsResult | null)[] = []
    for (const stop of destinationStops) {
      await new Promise(resolve => setTimeout(resolve, 200))
      const result = await new Promise<google.maps.DirectionsResult | null>((resolve) => {
        directionsService.route(
          {
            origin: destination,
            destination: { lat: stop.lat, lng: stop.lon },
            travelMode: google.maps.TravelMode.WALKING,
          },
          (result, status) => {
            resolve(status === "OK" && result ? result : null)
          },
        )
      })
      destResults.push(result)
    }
    setDestinationStopRoutes(
      destResults.filter(Boolean) as google.maps.DirectionsResult[]
    )
  }

  run()
}, [origin, destination, pickupStops, destinationStops, isLoaded])

  const allStops = useMemo(() => {
    return [
      ...pickupStops,
      ...destinationStops,
    ]
  }, [
    pickupStops,
    destinationStops,
  ])

  const pickupPolygon = useMemo(() => {
    if (!origin) return []

    const size = 0.008

    return [
      {
        lat: origin.lat - size,
        lng: origin.lng - size,
      },
      {
        lat: origin.lat - size,
        lng: origin.lng + size,
      },
      {
        lat: origin.lat + size,
        lng: origin.lng + size,
      },
      {
        lat: origin.lat + size,
        lng: origin.lng - size,
      },
    ]
  }, [origin])

  const destinationPolygon =
    useMemo(() => {
      if (!destination) return []

      const size = 0.008

      return [
        {
          lat: destination.lat - size,
          lng:
            destination.lng - size,
        },
        {
          lat: destination.lat - size,
          lng:
            destination.lng + size,
        },
        {
          lat: destination.lat + size,
          lng:
            destination.lng + size,
        },
        {
          lat: destination.lat + size,
          lng:
            destination.lng - size,
        },
      ]
    }, [destination])

 
  const onPickupPlaceChanged = () => {
  const place =
    pickupRef.current?.getPlace()

  if (
    !place?.geometry?.location
  )
    return

  setPickupText(
    place.formatted_address ||
      "",
  )

  setOrigin({
    lat:
      place.geometry.location.lat(),
    lng:
      place.geometry.location.lng(),
  })
}

const onDestPlaceChanged = () => {
  const place =
    destRef.current?.getPlace()

  if (
    !place?.geometry?.location
  )
    return

  setDestText(
    place.formatted_address ||
      "",
  )

  setDestination({
    lat:
      place.geometry.location.lat(),
    lng:
      place.geometry.location.lng(),
  })
}
 if (!isLoaded) {
    return (
      <Flex
        h="100vh"
        justify="center"
        align="center"
      >
        <Spinner size="xl" />
      </Flex>
    )
  }
return (
  <Flex h="calc(100vh - 80px)">
    {/* Left Panel */}
    <Box
      w="340px"
      borderRight="1px solid #E2E8F0"
      p={5}
      overflowY="auto"
      bg="white"
    >
      <VStack
        align="stretch"
        gap={5}
      >
        <Box>
          <Heading size="md">
            Transit Heatmap
          </Heading>

          <Text
            color="gray.500"
            fontSize="sm"
            mt={1}
          >
            Find nearest metro,
            MMTS and bus stops
          </Text>
        </Box>

        {/* Pickup */}
        <Box>
          <Text
            mb={2}
            fontWeight="600"
          >
            Pickup Location
          </Text>

          <Autocomplete
            onLoad={(ref) =>
              (pickupRef.current =
                ref)
            }
            onPlaceChanged={
              onPickupPlaceChanged
            }
          >
            <Input
              placeholder="Enter pickup"
              value={pickupText}
              onChange={(e) =>
                setPickupText(
                  e.target.value,
                )
              }
            />
          </Autocomplete>
        </Box>

        {/* Destination */}
        <Box>
          <Text
            mb={2}
            fontWeight="600"
          >
            Destination
          </Text>

          <Autocomplete
            onLoad={(ref) =>
              (destRef.current =
                ref)
            }
            onPlaceChanged={
              onDestPlaceChanged
            }
          >
            <Input
              placeholder="Enter destination"
              value={destText}
              onChange={(e) =>
                setDestText(
                  e.target.value,
                )
              }
            />
          </Autocomplete>
        </Box>

        {/* Search */}
        <Button
          colorScheme="blue"
          onClick={
            fetchNearbyStops
          }
          disabled={
            !origin ||
            !destination
          }
        >
          Find Nearby Transit
        </Button>

        {/* Route Guide */}

        {(pickupStops.length > 0 ||
  destinationStops.length > 0) && (
  <Box
    p={4}
    borderWidth="1px"
    borderRadius="lg"
    bg="gray.50"
  >
    <Heading
      size="sm"
      mb={3}
    >
      Route Guide
    </Heading>

    <VStack
      align="stretch"
      gap={2}
    >
      <Flex align="center" gap={2}>
        <Box
          w="18px"
          h="4px"
          bg="red.500"
          borderRadius="full"
        />
        <Text fontSize="sm">
          Main trip route
          (pickup →
          destination)
        </Text>
      </Flex>

      <Flex align="center" gap={2}>
        <Box
          w="18px"
          h="4px"
          bg="blue.500"
          borderRadius="full"
        />
        <Text fontSize="sm">
          Pickup →
          nearby transit
          stops
        </Text>
      </Flex>

      <Flex align="center" gap={2}>
        <Box
          w="18px"
          h="4px"
          bg="green.500"
          borderRadius="full"
        />
        <Text fontSize="sm">
          Destination →
          nearby transit
          stops
        </Text>
      </Flex>

      <Flex align="center" gap={2}>
        <Box
          w="18px"
          h="4px"
          bgGradient="linear(to-r, green.400, orange.400, red.500)"
          borderRadius="full"
        />
        <Text fontSize="sm">
          Traffic level
          (low → heavy)
        </Text>
      </Flex>
    </VStack>
  </Box>
)}
        {/* Loading */}
        {loadingStops && (
          <Flex
            justify="center"
            py={4}
          >
            <Spinner />
          </Flex>
        )}

        {/* Pickup Stops */}
        {!!pickupStops.length && (
          <Box>
            <Heading
              size="sm"
              mb={3}
            >
              Near Pickup
            </Heading>

            <VStack
              gap={2}
              align="stretch"
            >
              {pickupStops.map(
                (stop) => (
                  <Box
                    key={`${stop.name}-${stop.lat}`}
                    p={3}
                    borderWidth="1px"
                    borderRadius="lg"
                    cursor="pointer"
                    onClick={() =>
                      setSelectedStop(
                        stop,
                      )
                    }
                    _hover={{
                      bg:
                        "gray.50",
                    }}
                  >
                    <Text fontWeight="600">
                      {stop.name}
                    </Text>

                    <Text
                      fontSize="sm"
                      color="gray.500"
                    >
                      {stop.stop_type.toUpperCase()}
                    </Text>

                    <Text
                      fontSize="sm"
                    >
                      🚶{" "}
                      {
                        stop.walk_min
                      }{" "}
                      min walk
                    </Text>
                  </Box>
                ),
              )}
            </VStack>
          </Box>
        )}

        {/* Destination Stops */}
        {!!destinationStops.length && (
          <Box>
            <Heading
              size="sm"
              mb={3}
            >
              Near Destination
            </Heading>

            <VStack
              gap={2}
              align="stretch"
            >
              {destinationStops.map(
                (stop) => (
                  <Box
                    key={`${stop.name}-${stop.lon}`}
                    p={3}
                    borderWidth="1px"
                    borderRadius="lg"
                    cursor="pointer"
                    onClick={() =>
                      setSelectedStop(
                        stop,
                      )
                    }
                    _hover={{
                      bg:
                        "gray.50",
                    }}
                  >
                    <Text fontWeight="600">
                      {stop.name}
                    </Text>

                    <Text
                      fontSize="sm"
                      color="gray.500"
                    >
                      {stop.stop_type.toUpperCase()}
                    </Text>

                    <Text
                      fontSize="sm"
                    >
                      🚶{" "}
                      {
                        stop.walk_min
                      }{" "}
                      min walk
                    </Text>
                  </Box>
                ),
              )}
            </VStack>
          </Box>
        )}
      </VStack>
    </Box>

    {/* Map */}
    <Box flex={1}>
      <GoogleMap
        mapContainerStyle={{
          width: "100%",
          height: "100%",
        }}
        center={{
          lat: 17.385,
          lng: 78.4867,
        }}
        zoom={11}
        onLoad={(map) =>{
          mapRef.current =
            map
        }}
      >

      <TrafficLayer />
        {/* Origin */}
        {origin && (
          <>
            <Marker
              position={origin}
              label="P"
            />

            <Polygon
              paths={
                pickupPolygon
              }
              options={{
                fillColor:
                  "#3182CE",
                fillOpacity: 0.15,
                strokeColor:
                  "#3182CE",
                strokeWeight: 2,
              }}
            />
          </>
        )}

        {/* Destination */}
        {destination && (
          <>
            <Marker
              position={
                destination
              }
              label="D"
            />

            <Polygon
              paths={
                destinationPolygon
              }
              options={{
                fillColor:
                  "#38A169",
                fillOpacity: 0.15,
                strokeColor:
                  "#38A169",
                strokeWeight: 2,
              }}
            />
          </>
        )}
        {/* Main Route */}
{directions && (
  <DirectionsRenderer
    directions={directions}
    options={{
      polylineOptions: {
        strokeColor:
          "#E53E3E",
        strokeWeight: 5,
      },
      suppressMarkers: true,
    }}
  />
)}

{/* Pickup Stop Routes */}
{pickupStopRoutes.map(
  (route, index) => (
    <DirectionsRenderer
      key={`pickup-${index}`}
      directions={route}
      options={{
        polylineOptions: {
          strokeColor:
            "#3182CE",
          strokeWeight: 4,
        },
        suppressMarkers: true,
      }}
    />
  ),
)}

{/* Destination Stop Routes */}
{destinationStopRoutes.map(
  (route, index) => (
    <DirectionsRenderer
      key={`destination-${index}`}
      directions={route}
      options={{
        polylineOptions: {
          strokeColor:
            "#38A169",
          strokeWeight: 4,
        },
        suppressMarkers: true,
      }}
    />
  ),
)}
        {/* Transit Stops */}
        {allStops.map(
          (stop) => (
            <Marker
              key={`${stop.name}-${stop.lat}-${stop.lon}`}
              position={{
                lat: stop.lat,
                lng: stop.lon,
              }}
              onClick={() =>
                setSelectedStop(
                  stop,
                )
              }
            />
          ),
        )}

        {/* Stop Popup */}
        {selectedStop && (
          <InfoWindow
            position={{
              lat:
                selectedStop.lat,
              lng:
                selectedStop.lon,
            }}
            onCloseClick={() =>
              setSelectedStop(
                null,
              )
            }
          >
            <Box>
              <Text fontWeight="700">
                {
                  selectedStop.name
                }
              </Text>

              <Text>
                Type:{" "}
                {
                  selectedStop.stop_type
                }
              </Text>

              <Text>
                Walk:{" "}
                {
                  selectedStop.walk_min
                }{" "}
                min
              </Text>

              <Text>
                Distance:{" "}
                {
                  selectedStop.distance_m
                }
                m
              </Text>
            </Box>
          </InfoWindow>
        )}
      </GoogleMap>
    </Box>
  </Flex>
)
}
console.log(
  import.meta.env
    .VITE_GOOGLE_MAPS_KEY,
)