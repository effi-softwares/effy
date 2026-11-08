import { createRoute, useNavigate } from "@tanstack/react-router"

import { NotificationsScreen, validateNotificationsSearch } from "@/features/notifications/NotificationsScreen"

import { appRoute } from "./app"

export const notificationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "notifications",
  validateSearch: validateNotificationsSearch,
  component: NotificationsRoute,
})

function NotificationsRoute() {
  const search = notificationsRoute.useSearch()
  const navigate = useNavigate()
  return (
    <NotificationsScreen
      search={search}
      onSearchChange={(next) => void navigate({ to: "/notifications", search: next, replace: true })}
    />
  )
}
