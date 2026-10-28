import { createRoute } from "@tanstack/react-router"

import { ShopDetailScreen } from "@/features/shops/ShopDetailScreen"
import { shopHistoryList, shopsList, shopStockList } from "@/features/shops/list"
import { ShopsListScreen } from "@/features/shops/ShopsListScreen"

import { appRoute } from "./app"

export const shopsIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "shops",
  validateSearch: (raw: Record<string, unknown>) => shopsList.validateSearch(raw),
  component: ShopsListScreen,
})

export const shopDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "shops/$shopId",
  validateSearch: (raw: Record<string, unknown>) => ({
    ...shopHistoryList.validateSearch(raw),
    ...shopStockList.validateSearch(raw),
  }),
  component: ShopDetailRouteComponent,
})

function ShopDetailRouteComponent() {
  const { shopId } = shopDetailRoute.useParams()
  return <ShopDetailScreen shopId={shopId} />
}
