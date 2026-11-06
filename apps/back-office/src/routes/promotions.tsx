import { useQuery } from "@tanstack/react-query"
import { createRoute } from "@tanstack/react-router"

import { withActivityLog } from "@effy/web-kit/activity-log"

import { PromotionGroupScreen } from "@/features/promotion-groups/PromotionGroupScreen"
import { PromotionGroupsScreen } from "@/features/promotion-groups/PromotionGroupsScreen"
import { SkinEditorScreen } from "@/features/promotion-skins/SkinEditorScreen"
import { SkinsListScreen } from "@/features/promotion-skins/SkinsListScreen"
import { chosenCustomersList, codesList } from "@/features/promotions/list"
import { BannerEditorScreen } from "@/features/promotions/BannerEditorScreen"
import { PromotionDetailScreen } from "@/features/promotions/PromotionDetailScreen"
import { PromotionEditorScreen } from "@/features/promotions/PromotionEditorScreen"
import { PromotionsListScreen, promotionsList } from "@/features/promotions/PromotionsListScreen"
import { promotionQuery } from "@/features/promotions/queries"

import { appRoute } from "./app"

export const promotionsIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions",
  validateSearch: (raw: Record<string, unknown>) => promotionsList.validateSearch(raw),
  component: PromotionsListScreen,
})

export const createPromotionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/new",
  component: () => <PromotionEditorScreen />,
})

/** An information banner (108): words and where a tap leads, no offer. */
export const createBannerRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/banners/new",
  component: () => <BannerEditorScreen />,
})

export const promotionDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "promotions/$promoId",
  validateSearch: (raw: Record<string, unknown>) => ({
    ...codesList.validateSearch(raw),
    ...chosenCustomersList.validateSearch(raw),
    ...withActivityLog(raw),
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
    // One edit address for both kinds: a banner opens its own editor once the promotion is read.
    const p = useQuery(promotionQuery(promoId))
    if (p.data?.kind === "banner") return <BannerEditorScreen promoId={promoId} existing={p.data} />
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
