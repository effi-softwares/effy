import { createRoute } from "@tanstack/react-router"

import { PromotionGroupScreen } from "@/features/promotion-groups/PromotionGroupScreen"
import { PromotionGroupsScreen } from "@/features/promotion-groups/PromotionGroupsScreen"
import { SkinEditorScreen } from "@/features/promotion-skins/SkinEditorScreen"
import { SkinsListScreen } from "@/features/promotion-skins/SkinsListScreen"
import { OrderRulesScreen } from "@/features/promotions/OrderRulesScreen"
import { chosenCustomersList, codesList } from "@/features/promotions/list"
import { PromotionDetailScreen } from "@/features/promotions/PromotionDetailScreen"
import { PromotionEditorScreen } from "@/features/promotions/PromotionEditorScreen"
import { PromotionsListScreen, promotionsList } from "@/features/promotions/PromotionsListScreen"

import { appRoute } from "./app"

export const promotionsIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions",
  validateSearch: (raw: Record<string, unknown>) => promotionsList.validateSearch(raw),
  component: PromotionsListScreen,
})

export const orderRulesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/order-rules",
  component: OrderRulesScreen,
})

export const createPromotionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/new",
  component: () => <PromotionEditorScreen />,
})

export const promotionDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/$promoId",
  validateSearch: (raw: Record<string, unknown>) => ({
    ...codesList.validateSearch(raw),
    ...chosenCustomersList.validateSearch(raw),
  }),
  component: function PromotionDetailRoute() {
    const { promoId } = promotionDetailRoute.useParams()
    return <PromotionDetailScreen promoId={promoId} />
  },
})

export const editPromotionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/$promoId/edit",
  component: function EditPromotionRoute() {
    const { promoId } = editPromotionRoute.useParams()
    return <PromotionEditorScreen promoId={promoId} />
  },
})

export const promotionGroupsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/groups",
  component: PromotionGroupsScreen,
})

export const promotionGroupRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/groups/$groupId",
  component: function PromotionGroupRoute() {
    const { groupId } = promotionGroupRoute.useParams()
    return <PromotionGroupScreen groupId={groupId} />
  },
})

export const promotionSkinsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/skins",
  component: SkinsListScreen,
})

export const createSkinRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/skins/new",
  component: () => <SkinEditorScreen />,
})

export const promotionSkinRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/skins/$skinId",
  component: function PromotionSkinRoute() {
    const { skinId } = promotionSkinRoute.useParams()
    return <SkinEditorScreen skinId={skinId} />
  },
})
