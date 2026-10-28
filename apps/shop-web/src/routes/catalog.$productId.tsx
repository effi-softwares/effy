import { createRoute } from "@tanstack/react-router"

import { ProductDetailScreen } from "@/features/catalog/ProductDetailScreen"
import { movementsList } from "@/features/catalog/StockHistory"

import { appRoute } from "./app"

export const catalogProductRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "catalog/$productId",
  validateSearch: (search: Record<string, unknown>) => ({
    ...movementsList.validateSearch(search),
    ...(typeof search.size === "string" ? { size: search.size } : {}),
  }),
  component: CatalogProductScreen,
})

function CatalogProductScreen() {
  const { productId } = catalogProductRoute.useParams()
  const { size } = catalogProductRoute.useSearch()
  return <ProductDetailScreen productId={productId} initialSize={size} />
}
