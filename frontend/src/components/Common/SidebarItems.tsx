import { Box, Flex, Icon, Text } from "@chakra-ui/react"
import { useQueryClient } from "@tanstack/react-query"
import { Link as RouterLink, useRouterState } from "@tanstack/react-router"
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

const BLUE = "#B91C1C"

const mainItems = [
  { icon: FiHome, title: "Dashboard", path: "/dashboard" },
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
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  const renderItems = (items: Item[]) =>
    items.map(({ icon, title, path }) => {
      const isActive = currentPath === path
      return (
        <RouterLink key={title} to={path as any} onClick={onClose}>
          <Flex
            gap={3}
            px={3}
            py={2.5}
            borderRadius="8px"
            bg={isActive ? "white" : "transparent"}
            alignItems="center"
            fontSize="0.875rem"
            color={isActive ? BLUE : "rgba(255,255,255,0.72)"}
            fontWeight={isActive ? "700" : "400"}
            _hover={{
              bg: isActive ? "white" : "rgba(255,255,255,0.10)",
              color: isActive ? BLUE : "white",
            }}
            mb={0.5}
            transition="all 0.15s ease"
            style={
              isActive
                ? { boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }
                : undefined
            }
          >
            <Icon
              as={icon}
              alignSelf="center"
              fontSize="1rem"
              color={isActive ? BLUE : "rgba(255,255,255,0.72)"}
            />
            <Text fontSize="inherit">{title}</Text>
          </Flex>
        </RouterLink>
      )
    })

  return (
    <>
      <Text
        fontSize="0.6rem"
        px={3}
        pt={1}
        pb={2}
        fontWeight="700"
        color="rgba(255,255,255,0.40)"
        letterSpacing="3px"
        textTransform="uppercase"
      >
        Navigate
      </Text>
      <Box mb={5}>{renderItems(mainItems)}</Box>

      <Text
        fontSize="0.6rem"
        px={3}
        pt={1}
        pb={2}
        fontWeight="700"
        color="rgba(255,255,255,0.40)"
        letterSpacing="3px"
        textTransform="uppercase"
      >
        Account
      </Text>
      <Box mb={4}>
        {renderItems([{ icon: FiSettings, title: "Settings", path: "/settings" }])}
      </Box>

      {currentUser?.is_superuser && (
        <>
          <Text
            fontSize="0.6rem"
            px={3}
            pt={1}
            pb={2}
            fontWeight="700"
            color="rgba(255,255,255,0.40)"
            letterSpacing="3px"
            textTransform="uppercase"
          >
            Admin
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
