import { createRoute } from "@tanstack/react-router";

import { ReviewItemScreen } from "@/features/product-review/ReviewItemScreen";
import { ReviewQueueScreen } from "@/features/product-review/ReviewQueueScreen";

import { appRoute } from "./app";

export const productReviewIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "product-review",
  component: ReviewQueueScreen,
});

export const productReviewItemRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "product-review/$productId",
  component: ProductReviewItemRouteComponent,
});

function ProductReviewItemRouteComponent() {
  const { productId } = productReviewItemRoute.useParams();
  return <ReviewItemScreen productId={productId} />;
}
