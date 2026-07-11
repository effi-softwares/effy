import { createRoute } from "@tanstack/react-router";

import { ShopDetailScreen } from "@/features/shops/ShopDetailScreen";
import { ShopsListScreen } from "@/features/shops/ShopsListScreen";

import { appRoute } from "./app";

// Shop management (009). Both routes nest under the protected app shell (appRoute), so the session
// guard runs first. Read access is open to any signed-in back-office role; mutating controls are
// gated in the screens (and independently enforced by the backend).
export const shopsIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "shops",
  component: ShopsListScreen,
});

export const shopDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "shops/$shopId",
  component: ShopDetailRouteComponent,
});

function ShopDetailRouteComponent() {
  const { shopId } = shopDetailRoute.useParams();
  return <ShopDetailScreen shopId={shopId} />;
}
