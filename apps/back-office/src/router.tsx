import type { QueryClient } from "@tanstack/react-query"
import { createRouter } from "@tanstack/react-router"

import { StatusPage } from "./components/patterns/StatusPage"
import { rootRoute } from "./routes/__root"
import { adminRoute, appIndexRoute, appRoute } from "./routes/app"
import { authLayoutRoute, signInRoute } from "./routes/auth"
import { taxonomyRoute } from "./routes/taxonomy"
import { customerDetailRoute, customersIndexRoute } from "./routes/customers"
import { deliverabilityDetailRoute, deliverabilityIndexRoute } from "./routes/deliverability"
import { deliveryIndexRoute } from "./routes/delivery"
import { driverDetailRoute, driversIndexRoute } from "./routes/drivers"
import { exceptionsRoute } from "./routes/exceptions"
import { feedbackDetailRoute, feedbackIndexRoute } from "./routes/feedback"
import { hubRoute } from "./routes/hub"
import {
  orderDetailRoute,
  ordersAssignmentRoundRoute,
  ordersAssignmentsRoute,
  ordersHandoverRoute,
  ordersIndexRoute,
} from "./routes/orders"
import {
  productReviewIndexRoute,
  productReviewItemRoute,
  productReviewMissingDetailsRoute,
} from "./routes/product-review"
import {
  createPromotionRoute,
  createSkinRoute,
  editPromotionRoute,
  orderRulesRoute,
  promotionDetailRoute,
  promotionGroupRoute,
  promotionGroupsRoute,
  promotionSkinRoute,
  promotionSkinsRoute,
  promotionsIndexRoute,
} from "./routes/promotions"
import { handoverReportRoute } from "./routes/reports"
import { taxSettingsRoute } from "./routes/settings"
import { shopDetailRoute, shopsIndexRoute } from "./routes/shops"
import { vehicleDetailRoute, vehiclesIndexRoute } from "./routes/vehicles"

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([
    appIndexRoute,
    adminRoute,
    shopsIndexRoute,
    shopDetailRoute,
    ordersIndexRoute,
    ordersHandoverRoute,
    ordersAssignmentsRoute,
    ordersAssignmentRoundRoute,
    orderDetailRoute,
    customersIndexRoute,
    customerDetailRoute,
    driversIndexRoute,
    driverDetailRoute,
    vehiclesIndexRoute,
    vehicleDetailRoute,
    exceptionsRoute,
    hubRoute,
    handoverReportRoute,
    taxSettingsRoute,
    deliverabilityIndexRoute,
    deliverabilityDetailRoute,
    deliveryIndexRoute,
    productReviewIndexRoute,
    productReviewMissingDetailsRoute,
    productReviewItemRoute,
    feedbackIndexRoute,
    feedbackDetailRoute,
    taxonomyRoute,
    promotionsIndexRoute,
    orderRulesRoute,
    createPromotionRoute,
    promotionDetailRoute,
    editPromotionRoute,
    promotionGroupsRoute,
    promotionGroupRoute,
    promotionSkinsRoute,
    createSkinRoute,
    promotionSkinRoute,
  ]),
  authLayoutRoute.addChildren([signInRoute]),
])

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultNotFoundComponent: () => <StatusPage kind="notfound" />,
  })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
