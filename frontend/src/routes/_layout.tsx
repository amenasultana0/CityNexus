import { Box, Flex } from "@chakra-ui/react"
import { createFileRoute, Outlet } from "@tanstack/react-router"

import Sidebar from "@/components/Common/Sidebar"
import { TopNavbar } from "@/components/Common/TopNavbar"

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
    <Flex flexDir="column" h="100vh" overflow="hidden">
      {/* Full-width top navbar */}
      <TopNavbar />

      {/* Sidebar + page content below navbar */}
      <Flex flex="1" overflow="hidden">
        <Sidebar />
        <Box flex="1" overflowY="auto" bg="#f5f5f4">
          <Outlet />
        </Box>
      </Flex>
    </Flex>
  )
}

export default Layout
