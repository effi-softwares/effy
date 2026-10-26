import type { LiveKind } from "@effy/shared-types"
import type { QueryKey } from "@tanstack/react-query"

const ORDERS: QueryKey = ["orders"]
const DISPATCH: QueryKey = ["dispatch"]
const DRIVERS: QueryKey = ["drivers"]
const EXCEPTIONS: QueryKey = ["exceptions"]
const SLOTS: QueryKey = ["back-office", "delivery", "slots"]
const COVERAGE: QueryKey = ["back-office", "delivery", "coverage"]
const PRICING: QueryKey = ["back-office", "delivery", "plans"]
const REVIEW: QueryKey = ["product-review"]
const CUSTOMERS: QueryKey = ["customers"]
const TAXONOMY: QueryKey = ["taxonomy"]

export const LIVE_ROUTES: Partial<Record<LiveKind, readonly QueryKey[]>> = {
  orders: [ORDERS],
  dispatch: [DISPATCH, DRIVERS, EXCEPTIONS],
  slots: [SLOTS],
  review: [REVIEW],
  points: [CUSTOMERS, ORDERS],
  coverage: [COVERAGE],
  pricing: [PRICING],
  // The category tree, a form or the attribute library changed (101).
  taxonomy: [TAXONOMY],
  // A promotion or a display group changed: open promotion screens re-read.
  promotions: [
    ["back-office", "promotions"],
    ["back-office", "promotion-groups"],
  ],
}
