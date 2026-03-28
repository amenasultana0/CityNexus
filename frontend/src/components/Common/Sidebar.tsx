import { Box, Flex, IconButton, Text } from "@chakra-ui/react"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FaBars } from "react-icons/fa"
import { FiLogOut } from "react-icons/fi"

import type { UserPublic } from "@/client"
import useAuth from "@/hooks/useAuth"
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerRoot,
  DrawerTrigger,
} from "../ui/drawer"
import SidebarItems from "./SidebarItems"

const Sidebar = () => {
  const queryClient = useQueryClient()
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile */}
      <DrawerRoot
        placement="start"
        open={open}
        onOpenChange={(e) => setOpen(e.open)}
      >
        <DrawerBackdrop />
        <DrawerTrigger asChild>
          <IconButton
            variant="ghost"
            color="inherit"
            display={{ base: "flex", md: "none" }}
            aria-label="Open Menu"
            position="absolute"
            zIndex="100"
            m={4}
          >
            <FaBars />
          </IconButton>
        </DrawerTrigger>
        <DrawerContent maxW="xs">
          <DrawerCloseTrigger />
          <DrawerBody>
            <Flex flexDir="column" h="100%">
              {/* Logo Section */}
              <Box p={4} borderBottomWidth="1px" mb={4}>
                <Text fontSize="2xl" fontWeight="bold" color="teal.400">
                  CityNexus
                </Text>
                <Text fontSize="xs" color="gray.500" letterSpacing="wider">
                  RIDE INTELLIGENCE
                </Text>
              </Box>

              {/* Navigation */}
              <Box flex="1" overflowY="auto">
                <SidebarItems onClose={() => setOpen(false)} />
              </Box>

              {/* Logout and User Info */}
              <Box borderTopWidth="1px" pt={4}>
                <Flex
                  as="button"
                  onClick={() => {
                    logout()
                  }}
                  alignItems="center"
                  gap={4}
                  px={4}
                  py={2}
                  w="100%"
                >
                  <FiLogOut />
                  <Text>Log Out</Text>
                </Flex>
                {currentUser?.email && (
                  <Text fontSize="sm" p={2} truncate maxW="sm">
                    Logged in as: {currentUser.email}
                  </Text>
                )}
              </Box>
            </Flex>
          </DrawerBody>
          <DrawerCloseTrigger />
        </DrawerContent>
      </DrawerRoot>

      {/* Desktop */}

      <Box
        display={{ base: "none", md: "flex" }}
        position="sticky"
        bg="bg.subtle"
        top={0}
        minW="xs"
        h="100vh"
        flexDir="column"
      >
        {/* Logo Section */}
        <Box p={6} borderBottomWidth="1px">
          <Text fontSize="2xl" fontWeight="bold" color="teal.400">
            CityNexus
          </Text>
          <Text fontSize="xs" color="gray.500" letterSpacing="wider">
            RIDE INTELLIGENCE
          </Text>
        </Box>

        {/* Navigation */}
        <Box flex="1" overflowY="auto" p={4}>
          <SidebarItems />
        </Box>

        {/* Bottom Status */}
        <Box p={4} borderTopWidth="1px">
          <Flex fontSize="xs" color="gray.500" gap={2}>
            <Text>Hyderabad</Text>
            <Text>·</Text>
            <Flex alignItems="center" gap={1}>
              <Box w={2} h={2} borderRadius="full" bg="green.500" />
              <Text>Live</Text>
            </Flex>
          </Flex>
        </Box>
      </Box>
    </>
  )
}

export default Sidebar
