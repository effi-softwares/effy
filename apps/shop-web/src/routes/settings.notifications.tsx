import { createRoute } from "@tanstack/react-router"

import { NotificationSettingsScreen } from "@/features/notifications/NotificationSettings"

import { appRoute } from "./app"

export const notificationSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/notifications",
  component: NotificationSettingsScreen,
})
