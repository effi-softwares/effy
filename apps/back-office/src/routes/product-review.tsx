import { createRoute } from "@tanstack/react-router"

import { marginNotSetList, missingDetailsList, REVIEW_VIEWS, reviewQueueList } from "@/features/product-review/list"
import { MissingDetailsScreen } from "@/features/product-review/MissingDetailsScreen"
import { ReviewItemScreen } from "@/features/product-review/ReviewItemScreen"
import { ReviewQueueScreen } from "@/features/product-review/ReviewQueueScreen"

import { appRoute } from "./app"

export const productReviewIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "product-review",
  validateSearch: (raw: Record<string, unknown>) => ({
    ...(REVIEW_VIEWS.includes(raw.view as never) && raw.view !== "waiting" ? { view: raw.view as string } : {}),
    ...reviewQueueList.validateSearch(raw),
    ...marginNotSetList.validateSearch(raw),
  }),
  component: ReviewQueueScreen,
})

export const productReviewMissingDetailsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "product-review/missing-details",
  validateSearch: (raw: Record<string, unknown>) => missingDetailsList.validateSearch(raw),
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
