import { createRoute } from "@tanstack/react-router";

import { DeliveryZonesScreen } from "@/features/delivery/DeliveryZonesScreen";
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

export const deliveryZoneDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "delivery-zones/$zoneId",
  component: ZoneDetailRouteComponent,
});

function ZoneDetailRouteComponent() {
  const { zoneId } = deliveryZoneDetailRoute.useParams();
  return <ZoneDetailScreen zoneId={zoneId} />;
}
