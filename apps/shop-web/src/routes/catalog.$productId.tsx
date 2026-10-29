import { createRoute } from "@tanstack/react-router"

import { ProductDetailScreen } from "@/features/catalog/ProductDetailScreen"
import { withActivityLog } from "@effy/web-kit/activity-log"

import { appRoute } from "./app"

export const catalogProductRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "catalog/$productId",
  validateSearch: (search: Record<string, unknown>) => ({
    ...withActivityLog(search),
    ...(typeof search.size === "string" ? { size: search.size } : {}),
  }),
  component: CatalogProductScreen,
})

function CatalogProductScreen() {
  const { productId } = catalogProductRoute.useParams()
  const { size } = catalogProductRoute.useSearch()
  return <ProductDetailScreen productId={productId} initialSize={size} />
}
