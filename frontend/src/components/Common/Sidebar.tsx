import { Box, Flex, IconButton, Text } from "@chakra-ui/react"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FaBars } from "react-icons/fa"
import { LogOut } from "lucide-react"

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

const SidebarContent = ({ onClose }: { onClose?: () => void }) => {
  const queryClient = useQueryClient()
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])
  const { logout } = useAuth()

  const displayName = currentUser?.full_name || "User"
  const email = currentUser?.email || "user@citynexus.com"
  const avatarLetter = (displayName[0] || "U").toUpperCase()

  return (
    <Flex
      flexDir="column"
      h="100%"
      style={{
        background: "linear-gradient(180deg, #4d6b9c 0%, #16213e 100%)",
      }}
    >
      {/* Navigation (kept, only heading removed) */}
      <Box flex="1" overflowY="auto" p={3} pt={4}>
        <SidebarItems onClose={onClose} />
      </Box>

      {/* User profile */}
      <Box px={4} pb={2} flexShrink={0}>
        <Box h="1px" bg="rgba(255,255,255,0.15)" mb={4} />
        <Flex align="center" gap={3} mb={4}>
          {/* Avatar */}
          <Flex
            w="38px"
            h="38px"
            borderRadius="full"
            bg="rgba(255,255,255,0.18)"
            border="2px solid rgba(255,255,255,0.3)"
            align="center"
            justify="center"
            flexShrink={0}
          >
            <Text color="white" fontWeight="bold" fontSize="sm">
              {avatarLetter}
            </Text>
          </Flex>

          {/* Name + email */}
          <Box flex="1" minW={0}>
            <Text color="white" fontWeight="bold" fontSize="sm" truncate>
              {displayName}
            </Text>
            <Text color="rgba(255,255,255,0.55)" fontSize="0.7rem" truncate>
              {email}
            </Text>
          </Box>

          {/* Logout */}
          <IconButton
            aria-label="Log out"
            variant="ghost"
            size="sm"
            onClick={() => logout()}
            style={{ color: "rgba(255,255,255,0.6)", flexShrink: 0 }}
            _hover={{ bg: "rgba(255,255,255,0.12)", color: "white" }}
          >
            <LogOut size={16} />
          </IconButton>
        </Flex>
      </Box>

      {/* Live indicator */}
      <Box px={5} pb={6} flexShrink={0}>
        <Flex alignItems="center" gap={2}>
          <Box w={2} h={2} borderRadius="full" bg="#10b981" flexShrink={0} />
          <Text fontSize="xs" color="rgba(255,255,255,0.6)">
            Hyderabad · Live
          </Text>
        </Flex>
      </Box>
    </Flex>
  )
}

const Sidebar = () => {
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
        <DrawerContent maxW="xs" style={{ padding: 0 }}>
          <DrawerCloseTrigger color="white" />
          <DrawerBody p={0} h="100%">
            <Box
              h="100%"
              style={{
                background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)",
              }}
            >
              <SidebarContent onClose={() => setOpen(false)} />
            </Box>
          </DrawerBody>
        </DrawerContent>
      </DrawerRoot>

      {/* Desktop */}
      <Box
        display={{ base: "none", md: "flex" }}
        position="sticky"
        top={0}
        minW="240px"
        maxW="240px"
        h="100vh"
        flexDir="column"
        flexShrink={0}
      >
        <SidebarContent />
      </Box>
    </>
  )
}

export default Sidebar