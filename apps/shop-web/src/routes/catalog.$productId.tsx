import { createRoute } from "@tanstack/react-router";

import { ProductDetailScreen } from "@/features/catalog/ProductDetailScreen";

import { appRoute } from "./app";

// The product detail page (US4/US5), nested under the protected shell so its `beforeLoad` guards the
// session. The `productId` path param drives the shop-scoped detail read (the backend refuses another
// shop's product with a 404, so no client-side ownership check is needed — FR-019/FR-031).
export const catalogProductRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "catalog/$productId",
  component: CatalogProductScreen,
});

function CatalogProductScreen() {
  const { productId } = catalogProductRoute.useParams();
  return <ProductDetailScreen productId={productId} />;
}
