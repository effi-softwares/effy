import { createRoute, redirect } from "@tanstack/react-router"

import { withActivityLog } from "@effy/web-kit/activity-log"

import { PointsSettingsScreen } from "@/features/customers/PointsSettingsScreen"
import { NotificationSettingsScreen } from "@/features/settings/notifications/NotificationSettingsScreen"
import { coverageList } from "@/features/delivery/coverage/list"
import { DeliveryDaysScreen } from "@/features/delivery/DeliveryDaysScreen"
import {
  DeliveryCourierScreen,
  DeliveryCoverageScreen,
  DeliveryPricingScreen,
  DeliveryWindowsScreen,
} from "@/features/delivery/DeliveryPages"
import { DriverWorkScreen } from "@/features/delivery/DriverWorkScreen"
import { HubScreen } from "@/features/delivery/HubScreen"
import { OrderRulesScreen } from "@/features/promotions/OrderRulesScreen"
import { SettingsIndexScreen } from "@/features/settings/SettingsIndexScreen"
import { TaxSettingsScreen } from "@/features/settings/tax/TaxSettingsScreen"
import { TeamScreen } from "@/features/staff-identity/TeamScreen"

import { appRoute } from "./app"

/**
 * Settings: every page that configures the platform lives under /settings (the settings redesign, 2026-11-03).
 * The addresses they had before redirect here, so a bookmark still opens the page.
 */
export const settingsIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings",
  component: SettingsIndexScreen,
})

export const deliveryCoverageRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/delivery/coverage",
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.tab === "string" ? { tab: search.tab } : {}),
    ...coverageList.validateSearch(search),
  }),
  component: DeliveryCoverageScreen,
})

export const deliveryCourierRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/delivery/courier",
  component: DeliveryCourierScreen,
})

export const deliveryPricingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/delivery/pricing",
  component: DeliveryPricingScreen,
})

export const deliveryWindowsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/delivery/windows",
  component: DeliveryWindowsScreen,
})

export const deliveryDaysRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/delivery/days",
  component: DeliveryDaysScreen,
})

export const hubSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/hub",
  component: HubScreen,
})

export const driverWorkRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/drivers",
  component: DriverWorkScreen,
})

export const orderRulesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/order-rules",
  component: OrderRulesScreen,
})

export const pointsSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/points",
  // The rule changes' activity drawer (104).
  validateSearch: (search: Record<string, unknown>) => withActivityLog(search),
  component: PointsSettingsScreen,
})

// 111 - the promotion limits, and their changes in the activity drawer (104).
export const notificationSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/notifications",
  validateSearch: (search: Record<string, unknown>) => withActivityLog(search),
  component: NotificationSettingsScreen,
})

export const taxSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/tax",
  component: TaxSettingsScreen,
})

export const teamRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/team",
  validateSearch: (search: Record<string, unknown>) => (search.tab === "roles" ? { tab: "roles" as const } : {}),
  component: TeamScreen,
})

/** Where each old Delivery tab lives now. */
const DELIVERY_TAB_TO = {
  coverage: "/settings/delivery/coverage",
  courier: "/settings/delivery/courier",
  pricing: "/settings/delivery/pricing",
  slots: "/settings/delivery/windows",
  days: "/settings/delivery/days",
  schedule: "/settings/hub",
  settings: "/settings/hub",
} as const

export const oldDeliveryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "delivery",
  beforeLoad: ({ search }) => {
    const tab = (search as { tab?: string }).tab
    throw redirect({
      to: DELIVERY_TAB_TO[(tab ?? "coverage") as keyof typeof DELIVERY_TAB_TO] ?? DELIVERY_TAB_TO.coverage,
      replace: true,
    })
  },
})

export const oldOrderRulesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/order-rules",
  beforeLoad: () => {
    throw redirect({ to: "/settings/order-rules", replace: true })
  },
})

export const oldAdminRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "admin",
  beforeLoad: () => {
    throw redirect({ to: "/settings/team", replace: true })
  },
})
