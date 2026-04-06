import { Box, Flex, Icon, Text } from "@chakra-ui/react"
import { useQueryClient } from "@tanstack/react-query"
import { Link as RouterLink } from "@tanstack/react-router"
import {
  FiHome,
  FiMap,
  FiCalendar,
  FiBarChart2,
  FiSettings,
  FiUsers,
} from "react-icons/fi"
import type { IconType } from "react-icons/lib"

import type { UserPublic } from "@/client"

const mainItems = [
  { icon: FiHome, title: "Dashboard", path: "/" },
  { icon: FiMap, title: "City Heatmap", path: "/heatmap" },
  { icon: FiCalendar, title: "Weekly Commute", path: "/weekly" },
  { icon: FiBarChart2, title: "Model Insights", path: "/insights" },
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
      <RouterLink key={title} to={path as any} onClick={onClose}>
        <Flex
          gap={4}
          px={4}
          py={2}
          _hover={{ background: "gray.subtle" }}
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
      <Text fontSize="xs" px={4} py={2} fontWeight="bold" color="gray.500">
        NAVIGATE
      </Text>
      <Box mb={4}>{renderItems(mainItems)}</Box>

      <Text fontSize="xs" px={4} py={2} fontWeight="bold" color="gray.500">
        ACCOUNT
      </Text>
      <Box mb={4}>
        {renderItems([{ icon: FiSettings, title: "Settings", path: "/settings" }])}
      </Box>

      {currentUser?.is_superuser && (
        <>
          <Text fontSize="xs" px={4} py={2} fontWeight="bold" color="gray.500">
            ADMIN
          </Text>
          <Box>
            {renderItems([
              { icon: FiUsers, title: "Admin Panel", path: "/admin" },
            ])}
          </Box>
        </>
      )}
    </>
  )
}

export default SidebarItems
