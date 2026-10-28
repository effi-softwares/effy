import { createRoute } from "@tanstack/react-router"

import { ShopDetailScreen } from "@/features/shops/ShopDetailScreen"
import { shopsList } from "@/features/shops/list"
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
  component: ShopDetailRouteComponent,
})

function ShopDetailRouteComponent() {
  const { shopId } = shopDetailRoute.useParams()
  return <ShopDetailScreen shopId={shopId} />
}
