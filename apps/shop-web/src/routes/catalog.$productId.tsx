import { createRoute } from "@tanstack/react-router";

import { ProductDetailScreen } from "@/features/catalog/ProductDetailScreen";

import { appRoute } from "./app";

// The product detail page (US4/US5), nested under the protected shell so its `beforeLoad` guards the
// session. The `productId` path param drives the shop-scoped detail read (the backend refuses another
// shop's product with a 404, so no client-side ownership check is needed — FR-019/FR-031).
export const catalogProductRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "catalog/$productId",
  // 098 — `?size=` opens the stock section on one size (Today's "Restock" names the size it means).
  validateSearch: (search: Record<string, unknown>): { size?: string } =>
    typeof search.size === "string" ? { size: search.size } : {},
  component: CatalogProductScreen,
});

function CatalogProductScreen() {
  const { productId } = catalogProductRoute.useParams();
  const { size } = catalogProductRoute.useSearch();
  return <ProductDetailScreen productId={productId} initialSize={size} />;
}
