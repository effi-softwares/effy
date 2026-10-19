import { createRoute } from "@tanstack/react-router";

import { PromotionGroupScreen } from "@/features/promotion-groups/PromotionGroupScreen";
import { PromotionGroupsScreen } from "@/features/promotion-groups/PromotionGroupsScreen";
import { OrderRulesScreen } from "@/features/promotions/OrderRulesScreen";
import { PromotionDetailScreen } from "@/features/promotions/PromotionDetailScreen";
import { PromotionEditorScreen } from "@/features/promotions/PromotionEditorScreen";
import { PromotionsListScreen } from "@/features/promotions/PromotionsListScreen";

import { appRoute } from "./app";

// Promotions, their display groups and the order rules (027, 094). All routes nest under the protected
// app shell. Read access is open to any signed-in back-office role; mutating controls are gated in the
// screens (and enforced by the backend). ⚠ The static paths (/order-rules, /new, /groups) are declared
// before /$promoId so TanStack ranks them first.
export const promotionsIndexRoute = createRoute({ getParentRoute: () => appRoute, path: "promotions", component: PromotionsListScreen });

export const orderRulesRoute = createRoute({ getParentRoute: () => appRoute, path: "promotions/order-rules", component: OrderRulesScreen });

export const createPromotionRoute = createRoute({ getParentRoute: () => appRoute, path: "promotions/new", component: () => <PromotionEditorScreen /> });

export const promotionGroupsRoute = createRoute({ getParentRoute: () => appRoute, path: "promotions/groups", component: PromotionGroupsScreen });

export const promotionGroupRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/groups/$groupId",
  component: function PromotionGroupRoute() {
    const { groupId } = promotionGroupRoute.useParams();
    return <PromotionGroupScreen groupId={groupId} />;
  },
});

export const promotionDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/$promoId",
  component: function PromotionDetailRoute() {
    const { promoId } = promotionDetailRoute.useParams();
    return <PromotionDetailScreen promoId={promoId} />;
  },
});

export const editPromotionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/$promoId/edit",
  component: function EditPromotionRoute() {
    const { promoId } = editPromotionRoute.useParams();
    return <PromotionEditorScreen promoId={promoId} />;
  },
});
