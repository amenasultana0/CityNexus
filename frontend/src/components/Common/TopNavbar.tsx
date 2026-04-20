import { Box, Flex, Text } from "@chakra-ui/react"
import { useQueryClient } from "@tanstack/react-query"
import type { UserPublic } from "@/client"

const RED = "#721c1c"
const GOLD = "#F59E0B"

export function TopNavbar() {
  const queryClient = useQueryClient()
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])

  const displayName = currentUser?.full_name || "User"
  const avatarLetter = (displayName[0] || "U").toUpperCase()

  return (
    <Box
      h="70px"
      px={7}
      flexShrink={0}
      zIndex={100}
      style={{
        background: "linear-gradient(180deg, #4d6b9c 0%, #16213e 100%)",
        boxShadow: `0 3px 0 ${RED}, 0 4px 20px rgba(72, 3, 3, 0.25)`,
      }}
    >
      <Flex h="100%" align="center" justify="space-between">
        {/* Brand */}
        <Flex align="center" gap={3}>
          {/* Dot cluster logo mark */}
          <Box position="relative" w="18px" h="18px" flexShrink={0}>
            <Box
              position="absolute"
              top="0"
              left="0"
              w="11px"
              h="11px"
              borderRadius="full"
              bg={RED}
            />
            <Box
              position="absolute"
              bottom="0"
              right="0"
              w="8px"
              h="8px"
              borderRadius="full"
              bg={GOLD}
            />
          </Box>

          <Text
            fontWeight="800"
            fontSize="1.3rem"
            letterSpacing="-0.5px"
            lineHeight="1"
          >
            <Box as="span" color="white">City</Box>
            <Box as="span" color={RED}>Nexus</Box>
          </Text>

          <Box
            h="18px"
            w="1px"
            bg="rgba(255,255,255,0.18)"
            display={{ base: "none", md: "block" }}
            mx={1}
          />
          <Text
            fontSize="0.6rem"
            color="rgba(255,255,255,0.38)"
            letterSpacing="3.5px"
            textTransform="uppercase"
            fontWeight="600"
            display={{ base: "none", md: "block" }}
          >
            Ride Intelligence
          </Text>
        </Flex>

        {/* Right side */}
        <Flex align="center" gap={4}>
          {/* HYD · LIVE pill */}
          <Flex
            align="center"
            gap={2}
            px={3}
            py={1}
            borderRadius="full"
            style={{
              background: "rgba(185,28,28,0.2)",
              border: "1px solid rgba(185,28,28,0.45)",
            }}
          >
            <Box
              w="7px"
              h="7px"
              borderRadius="full"
              bg={RED}
              style={{
                animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
              }}
            />
            <Text
              fontSize="0.65rem"
              color={RED}
              fontWeight="700"
              letterSpacing="0.12em"
            >
              HYD · LIVE
            </Text>
          </Flex>

          {/* User avatar */}
          <Flex align="center" gap={2}>
            <Flex
              w="34px"
              h="34px"
              borderRadius="full"
              align="center"
              justify="center"
              flexShrink={0}
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1.5px solid rgba(255,255,255,0.25)",
              }}
            >
              <Text color="white" fontWeight="700" fontSize="sm">
                {avatarLetter}
              </Text>
            </Flex>
            <Text
              fontSize="sm"
              color="rgba(255,255,255,0.78)"
              fontWeight="500"
              display={{ base: "none", md: "block" }}
            >
              {displayName}
            </Text>
          </Flex>
        </Flex>
      </Flex>
    </Box>
  )
}