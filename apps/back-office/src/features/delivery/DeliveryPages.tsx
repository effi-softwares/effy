import { PageHeader } from "@effy/web-kit/patterns"
import { useTourPage } from "@effy/web-kit/tour"

import { useSessionRoles } from "@/features/auth/useSessionRoles"

import { canManageDelivery } from "./access"
import { SlotsPanel } from "./components/SlotsPanel"
import { CoveragePanel } from "./coverage/CoveragePanel"
import { CourierPage } from "./coverage/CourierPage"
import { PricingPanel } from "./pricing/PricingPanel"

/**
 * Settings › Delivery: one route per page (Coverage, Courier delivery, Pricing, Delivery windows; Delivery days is its
 * own screen). Each is the panel that was a tab of the old Delivery screen, under its own address.
 */
export function DeliveryCoverageScreen() {
  useTourPage("delivery-coverage", { status: "ready" })
  return <CoveragePanel canManage={canManageDelivery(useSessionRoles())} />
}

export function DeliveryCourierScreen() {
  useTourPage("delivery-courier", { status: "ready" })
  return <CourierPage canManage={canManageDelivery(useSessionRoles())} />
}

export function DeliveryPricingScreen() {
  useTourPage("delivery-pricing", { status: "ready" })
  return (
    <>
      <PageHeader
        title="Pricing"
        description="How the delivery fee is calculated from base, distance, weight and the delivery-today surcharge."
      />
      <PricingPanel canManage={canManageDelivery(useSessionRoles())} />
    </>
  )
}

export function DeliveryWindowsScreen() {
  useTourPage("delivery-windows", { status: "ready" })
  return (
    <>
      <PageHeader
        title="Delivery windows"
        description="The daily delivery windows customers choose from, with their hours, cut-offs and capacity."
      />
      <SlotsPanel canManage={canManageDelivery(useSessionRoles())} />
    </>
  )
}
