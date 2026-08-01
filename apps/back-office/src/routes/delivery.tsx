import { createRoute } from "@tanstack/react-router";

import { ApprovalQueueScreen } from "@/features/delivery/ApprovalQueueScreen";
import { AreaDetailScreen } from "@/features/delivery/AreaDetailScreen";
import { DeliveryZonesScreen } from "@/features/delivery/DeliveryZonesScreen";
import { PricingRulesScreen } from "@/features/delivery/PricingRulesScreen";
import { RatesScreen } from "@/features/delivery/RatesScreen";
import { ZoneDetailScreen } from "@/features/delivery/ZoneDetailScreen";

import { appRoute } from "./app";

// Delivery zones & pricing (021). All routes nest under the protected app shell (appRoute), so the
// session guard runs first. Read access is open to any signed-in back-office role; mutating controls
// are gated in the screens (and independently enforced by the backend). The static /rates route is
// declared before the dynamic /$zoneId so TanStack ranks it first.
export const deliveryZonesIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "delivery-zones",
  component: DeliveryZonesScreen,
});

export const deliveryRatesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "delivery-zones/rates",
  component: RatesScreen,
});

// 032: pricing RULES — what delivery costs by distance and weight. Declared before /$zoneId so the
// static path ranks first, like /rates above.
//
// ⚠ /rates (021) still exists and is now a WINDOWS screen, not a prices one: delivery_offering keeps
// the lead time and whether a leg is offered, but no longer decides what anything costs. Two
// management surfaces for one concept is how configuration drifts — see T105.
export const deliveryPricingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "delivery-zones/pricing",
  component: PricingRulesScreen,
});

// 032: the same-day approval queue. Static path, declared before /$zoneId so it ranks first.
export const deliveryApprovalsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "delivery-zones/approvals",
  component: ApprovalQueueScreen,
});

export const deliveryZoneDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "delivery-zones/$zoneId",
  component: ZoneDetailRouteComponent,
});

function ZoneDetailRouteComponent() {
  const { zoneId } = deliveryZoneDetailRoute.useParams();
  return <ZoneDetailScreen zoneId={zoneId} />;
}

// 031: one area's configuration, on one screen. Declared after $zoneId so the more specific path
// still ranks correctly.
export const deliveryAreaDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "delivery-zones/$zoneId/areas/$postcode",
  component: AreaDetailRouteComponent,
});

function AreaDetailRouteComponent() {
  const { zoneId, postcode } = deliveryAreaDetailRoute.useParams();
  return <AreaDetailScreen zoneId={zoneId} postcode={postcode} />;
}
