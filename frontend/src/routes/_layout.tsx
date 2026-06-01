import { Box, Flex, Text } from "@chakra-ui/react"
import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router"
import { FiSun, FiMoon, FiSettings, FiLogOut, FiUser } from "react-icons/fi"
import { useState, useEffect } from "react"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout")({
  component: Layout,
})

const NAV_ITEMS = [
  { label: "Home",           to: "/dashboard" },
  { label: "Heatmap",        to: "/heatmap" },
  { label: "Weekly Commute", to: "/weekly" },
  { label: "Community",      to: "/community" },
  { label: "Model Insights", to: "/insights" },
]

function Layout() {
  const [dark, setDark] = useState(false)
  const [clockStr, setClockStr] = useState(() =>
    new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
  )
  const navigate = useNavigate()
  const { logout } = useAuth()

  useEffect(() => {
    const id = setInterval(() => {
      setClockStr(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const BG       = dark ? "#0a1628" : "#f8faff"
  const NAV_BG   = dark ? "#0d1f3c" : "#ffffff"
  const BORDER   = dark ? "#1e3a5f" : "#e2e8f0"
  const ACTIVE   = dark ? "#e8f0ff" : "#1a56db"
  const ACTIVE_BG = dark ? "#1e3a5f" : "#eef2ff"
  const TEXT     = dark ? "#94a3b8" : "#64748b"
  const LOGO     = dark ? "#00d4aa" : "#1a56db"
  const ICON_BG  = dark ? "#1e3a5f" : "#f1f5f9"
  const ICON_CLR = dark ? "#94a3b8" : "#64748b"

  return (
    <Flex direction="column" h="100vh" overflow="hidden">
      {/* ── Top Navbar ── */}
      <Flex
        as="nav"
        align="center"
        px={6}
        h="65px"
        bg={NAV_BG}
        borderBottom={`1px solid ${BORDER}`}
        flexShrink={0}
        justify="space-between"
        boxShadow="0 1px 4px rgba(0,0,0,0.06)"
      >
        {/* Left — logo + tabs */}
        <Flex align="center" gap={1}>
          <Text
            fontWeight="800"
            fontSize="md"
            color={LOGO}
            letterSpacing="tight"
            mr={6}
          >
            🏙 CityNexus
          </Text>

          {NAV_ITEMS.map((item) => (
            <Link key={item.to} to={item.to}>
              {({ isActive }: { isActive: boolean }) => (
                <Box
                  px={4}
                  py={1.5}
                  borderRadius="8px"
                  fontSize="sm"
                  fontWeight={isActive ? "700" : "500"}
                  color={isActive ? ACTIVE : TEXT}
                  bg={isActive ? ACTIVE_BG : "transparent"}
                  cursor="pointer"
                  _hover={{ color: ACTIVE, bg: ACTIVE_BG }}
                  transition="all 0.15s"
                >
                  {item.label}
                </Box>
              )}
            </Link>
          ))}
        </Flex>

        {/* Right — clock, dark mode, settings, avatar, logout */}
        <Flex align="center" gap={2}>
          <Text
            fontSize="sm"
            fontWeight="600"
            color={TEXT}
            px={3}
            py={1}
            borderRadius="8px"
            bg={ICON_BG}
            style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}
          >
            {clockStr}
          </Text>
          {/* Dark / Light toggle */}
          <Box
            as="button"
            w="32px" h="32px"
            borderRadius="full"
            bg={ICON_BG}
            display="flex" alignItems="center" justifyContent="center"
            color={ICON_CLR}
            cursor="pointer"
            _hover={{ bg: BORDER }}
            onClick={() => setDark(!dark)}
            title={dark ? "Light mode" : "Dark mode"}
          >
            {dark ? <FiSun size={15} /> : <FiMoon size={15} />}
          </Box>

          {/* Settings */}
          <Link to="/settings">
            <Box
              w="32px" h="32px"
              borderRadius="full"
              bg={ICON_BG}
              display="flex" alignItems="center" justifyContent="center"
              color={ICON_CLR}
              cursor="pointer"
              _hover={{ bg: BORDER }}
              title="Settings"
            >
              <FiSettings size={15} />
            </Box>
          </Link>

          {/* Profile avatar */}
          <Link to="/settings">
            <Box
              w="32px" h="32px"
              borderRadius="full"
              bg={ACTIVE_BG}
              display="flex" alignItems="center" justifyContent="center"
              color={ACTIVE}
              cursor="pointer"
              _hover={{ opacity: 0.8 }}
              title="Profile"
            >
              <FiUser size={15} />
            </Box>
          </Link>

          {/* Logout */}
          <Box
            as="button"
            w="32px" h="32px"
            borderRadius="full"
            bg={ICON_BG}
            display="flex" alignItems="center" justifyContent="center"
            color="#ef4444"
            cursor="pointer"
            _hover={{ bg: "#fee2e2" }}
            onClick={() => { logout(); navigate({ to: "/" }) }}
            title="Logout"
          >
            <FiLogOut size={15} />
          </Box>
        </Flex>
      </Flex>

      {/* ── Page Content ── */}
      <Box flex="1" overflowY="auto" bg={BG}>
        <Outlet />
      </Box>
    </Flex>
  )
}

export default Layout