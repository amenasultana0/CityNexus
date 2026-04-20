import { createFileRoute, redirect } from "@tanstack/react-router"

// /landing now lives at /  — redirect old URL for any bookmarked links
export const Route = createFileRoute("/landing")({
  component: () => null,
  beforeLoad: () => {
    throw redirect({ to: "/" })
  },
})
