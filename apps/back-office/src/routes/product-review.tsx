import { createRoute } from "@tanstack/react-router"

import { MissingDetailsScreen } from "@/features/product-review/MissingDetailsScreen"
import { ReviewItemScreen } from "@/features/product-review/ReviewItemScreen"
import { ReviewQueueScreen } from "@/features/product-review/ReviewQueueScreen"

import { appRoute } from "./app"

export const productReviewIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "product-review",
  component: ReviewQueueScreen,
})

export const productReviewMissingDetailsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "product-review/missing-details",
  component: MissingDetailsScreen,
})

export const productReviewItemRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "product-review/$productId",
  component: ProductReviewItemRouteComponent,
})

function ProductReviewItemRouteComponent() {
  const { productId } = productReviewItemRoute.useParams()
  return <ReviewItemScreen productId={productId} />
}
