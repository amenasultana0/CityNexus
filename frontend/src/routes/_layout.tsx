import { Box, Flex } from "@chakra-ui/react"
import { createFileRoute, Outlet } from "@tanstack/react-router"

import Sidebar from "@/components/Common/Sidebar"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  // beforeLoad: async () => {
  //   if (!isLoggedIn()) {
  //     throw redirect({
  //       to: "/login",
  //     })
  //   }
  // },
})

function Layout() {
  return (
    <Flex h="100vh" overflow="hidden">
      <Sidebar />
      <Box flex="1" overflowY="auto" bg="#f0f4f8">
        <Outlet />
      </Box>
    </Flex>
  )
}

export default Layout
