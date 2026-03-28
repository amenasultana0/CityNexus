import { Box, Flex, Icon, Text } from "@chakra-ui/react"
import { useQueryClient } from "@tanstack/react-query"
import { Link as RouterLink } from "@tanstack/react-router"
import {
  FiHome,
  FiSettings,
  FiUsers,
  FiMapPin,
  FiAlertTriangle,
  FiTarget,
  FiClock,
  FiTrendingUp,
  FiDollarSign,
  FiCalendar,
  FiUser
} from "react-icons/fi"
import type { IconType } from "react-icons/lib"

import type { UserPublic } from "@/client"

const mainItems = [
  { icon: FiHome, title: "Dashboard", path: "/" },
  { icon: FiMapPin, title: "Trip Planner", path: "/trip-planner" },
  { icon: FiAlertTriangle, title: "Risk Analysis", path: "/risk-analysis" },
]

const featureItems = [
  { icon: FiTarget, title: "Pickup Optimizer", path: "/pickup-optimizer" },
  { icon: FiClock, title: "Best Time", path: "/best-time" },
  { icon: FiTrendingUp, title: "Route Reliability", path: "/route-reliability" },
  { icon: FiDollarSign, title: "Cost Estimator", path: "/cost-estimator" },
  { icon: FiCalendar, title: "Commute Planner", path: "/commute-planner" },
]

const accountItems = [
  { icon: FiUser, title: "Profile", path: "/profile" },
  { icon: FiSettings, title: "Settings", path: "/settings" },
]

interface SidebarItemsProps {
  onClose?: () => void
}

interface Item {
  icon: IconType
  title: string
  path: string
}

const SidebarItems = ({ onClose }: SidebarItemsProps) => {
  const queryClient = useQueryClient()
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])

  const renderItems = (items: Item[]) =>
    items.map(({ icon, title, path }) => (
      <RouterLink key={title} to={path} onClick={onClose}>
        <Flex
          gap={4}
          px={4}
          py={2}
          _hover={{
            background: "gray.subtle",
          }}
          alignItems="center"
          fontSize="sm"
        >
          <Icon as={icon} alignSelf="center" />
          <Text ml={2}>{title}</Text>
        </Flex>
      </RouterLink>
    ))

  return (
    <>
      {/* MAIN Section */}
      <Text fontSize="xs" px={4} py={2} fontWeight="bold" color="gray.500">
        MAIN
      </Text>
      <Box mb={4}>{renderItems(mainItems)}</Box>

      {/* FEATURES Section */}
      <Text fontSize="xs" px={4} py={2} fontWeight="bold" color="gray.500">
        FEATURES
      </Text>
      <Box mb={4}>{renderItems(featureItems)}</Box>

      {/* ACCOUNT Section */}
      <Text fontSize="xs" px={4} py={2} fontWeight="bold" color="gray.500">
        ACCOUNT
      </Text>
      <Box mb={4}>{renderItems(accountItems)}</Box>

      {/* Admin - Only for superusers */}
      {currentUser?.is_superuser && (
        <>
          <Text fontSize="xs" px={4} py={2} fontWeight="bold" color="gray.500">
            ADMIN
          </Text>
          <Box>
            {renderItems([{ icon: FiUsers, title: "Admin Panel", path: "/admin" }])}
          </Box>
        </>
      )}
    </>
  )
}

export default SidebarItems
