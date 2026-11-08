import type { ComponentType } from "react"

import type { LinkProps } from "@tanstack/react-router"
import {
  Bell,
  CalendarDays,
  Coins,
  MapPinned,
  ReceiptText,
  Route,
  ShieldCheck,
  ShoppingCart,
  Timer,
  Truck,
  Warehouse,
  Wallet,
} from "lucide-react"

import type { BackOfficeRole } from "@effy/shared-types"
import { PageHeader, SettingsLinkRow, SettingsList, SettingsPage, SettingsSection } from "@effy/web-kit/patterns"
import { useTourPage } from "@effy/web-kit/tour"

import { useSessionRoles } from "@/features/auth/useSessionRoles"

export interface SettingsEntry {
  /** The sidebar leaf it is (nav.ts), so the two lists cannot drift - `SettingsIndexScreen.test.tsx`. */
  key: string
  to: LinkProps["to"]
  label: string
  hint: string
  icon: ComponentType<{ className?: string }>
  requiredRole?: BackOfficeRole
}

export interface SettingsGroup {
  title: string
  description: string
  tour: string
  entries: SettingsEntry[]
}

/** Every settings page, in the groups the index shows them under. */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    title: "Delivery",
    description: "Where Effy delivers, what it costs, and the windows and days customers choose from.",
    tour: "settings.delivery",
    entries: [
      {
        key: "coverage",
        to: "/settings/delivery/coverage",
        label: "Coverage",
        hint: "The postcodes Effy's drivers deliver to, and where delivery today is offered.",
        icon: MapPinned,
      },
      {
        key: "courier-delivery",
        to: "/settings/delivery/courier",
        label: "Courier delivery",
        hint: "Delivery by courier outside Effy's area, the services used, and excluded postcodes.",
        icon: Truck,
      },
      {
        key: "pricing",
        to: "/settings/delivery/pricing",
        label: "Pricing",
        hint: "Fee plans for Effy delivery and courier tables, and a calculator to try them.",
        icon: Wallet,
      },
      {
        key: "windows",
        to: "/settings/delivery/windows",
        label: "Delivery windows",
        hint: "The daily windows, their order-by times and how many deliveries each takes.",
        icon: Timer,
      },
      {
        key: "days",
        to: "/settings/delivery/days",
        label: "Delivery days",
        hint: "Days customers can choose, the “as soon as possible” estimate, and closed dates.",
        icon: CalendarDays,
      },
    ],
  },
  {
    title: "Hub and drivers",
    description: "How parcels move from shops through the hub, and the rules for drivers' work.",
    tour: "settings.operations",
    entries: [
      {
        key: "hub",
        to: "/settings/hub",
        label: "Hub and runs",
        hint: "The hub's location, prep and turnaround times, and collection runs from shops.",
        icon: Warehouse,
      },
      {
        key: "driver-work",
        to: "/settings/drivers",
        label: "Driver work",
        hint: "When rounds open, time at each stop, late-work alerts and the vehicle check.",
        icon: Route,
      },
    ],
  },
  {
    title: "Checkout",
    description: "The rules every cart is checked against, customers' points, and how often they hear about offers.",
    tour: "settings.checkout",
    entries: [
      {
        key: "order-rules",
        to: "/settings/order-rules",
        label: "Order rules",
        hint: "The minimum spend and the limits on a single cart.",
        icon: ShoppingCart,
      },
      {
        key: "points",
        to: "/settings/points",
        label: "Points",
        hint: "What a point is worth, when points expire, and the customer-service credit limit.",
        icon: Coins,
      },
      {
        key: "notifications",
        to: "/settings/notifications",
        label: "Notification limits",
        hint: "The most promotional notifications a customer who said yes gets in a day and in a week.",
        icon: Bell,
      },
    ],
  },
  {
    title: "Business",
    description: "Effy's own details and who works in back-office.",
    tour: "settings.business",
    entries: [
      {
        key: "tax",
        to: "/settings/tax",
        label: "Tax and invoices",
        hint: "Effy's legal name and ABN, how fees are taxed, and customer tax invoices.",
        icon: ReceiptText,
        requiredRole: "admin",
      },
      {
        key: "team",
        to: "/settings/team",
        label: "Team and access",
        hint: "Everyone with a back-office account, and what each role may do.",
        icon: ShieldCheck,
        requiredRole: "admin",
      },
    ],
  },
]

export function visibleSettings(roles: readonly BackOfficeRole[]): SettingsGroup[] {
  return SETTINGS_GROUPS.map((g) => ({
    ...g,
    entries: g.entries.filter((e) => !e.requiredRole || roles.includes(e.requiredRole)),
  })).filter((g) => g.entries.length > 0)
}

/** Settings: every page that configures the platform, in one place (Stripe's settings home). */
export function SettingsIndexScreen() {
  useTourPage("settings", { status: "ready" })
  const groups = visibleSettings(useSessionRoles())
  return (
    <>
      <PageHeader
        title="Settings"
        description="Everything that decides how Effy runs: delivery, the hub and drivers, checkout, and the business."
      />
      <SettingsPage>
        {groups.map((g) => (
          <SettingsSection key={g.title} tour={g.tour} title={g.title} description={g.description}>
            <SettingsList>
              {g.entries.map((e) => (
                <SettingsLinkRow key={e.key} link={{ to: e.to }} icon={e.icon} label={e.label} hint={e.hint} />
              ))}
            </SettingsList>
          </SettingsSection>
        ))}
      </SettingsPage>
    </>
  )
}
