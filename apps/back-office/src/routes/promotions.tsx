import { createRoute } from "@tanstack/react-router";

import { OrderRulesScreen } from "@/features/promotions/OrderRulesScreen";
import { PromotionDetailScreen } from "@/features/promotions/PromotionDetailScreen";
import { PromotionsListScreen } from "@/features/promotions/PromotionsListScreen";

import { appRoute } from "./app";

// Promotional codes & order rules (027 US10). All routes nest under the protected app shell
// (appRoute), so the session guard runs first. Read access is open to any signed-in back-office role;
// mutating controls are gated in the screens (and independently enforced by the backend). The static
// /order-rules route is declared before the dynamic /$promoId so TanStack ranks it first.
export const promotionsIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions",
  component: PromotionsListScreen,
});

export const orderRulesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/order-rules",
  component: OrderRulesScreen,
});

export const promotionDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/$promoId",
  component: PromotionDetailRouteComponent,
});

function PromotionDetailRouteComponent() {
  const { promoId } = promotionDetailRoute.useParams();
  return <PromotionDetailScreen promoId={promoId} />;
}
