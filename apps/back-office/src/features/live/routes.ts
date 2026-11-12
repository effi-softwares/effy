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
const PRODUCTS: QueryKey = ["products"]
// The Overview's runs and shops behind: a run changes on `dispatch`, a shop readying a package on `orders`.
const OVERVIEW_RUNS: QueryKey = ["dispatch", "overview"]

export const LIVE_ROUTES: Partial<Record<LiveKind, readonly QueryKey[]>> = {
  orders: [ORDERS, OVERVIEW_RUNS],
  dispatch: [DISPATCH, DRIVERS, EXCEPTIONS],
  slots: [SLOTS],
  review: [REVIEW],
  points: [CUSTOMERS, ORDERS],
  coverage: [COVERAGE],
  pricing: [PRICING],
  // The category tree, a form or the attribute library changed (101).
  taxonomy: [TAXONOMY],
  // A hold, a release, an Effy-created product or an import's progress (102); a change also leaves review.
  products: [PRODUCTS, REVIEW],
  // A promotion or a display group changed: open promotion screens re-read.
  promotions: [
    ["back-office", "promotions"],
    ["back-office", "promotion-groups"],
  ],
  // A message was written, sent, stopped or withdrawn, or moved on while sending (112).
  messages: [["back-office", "messages"]],
  // A clean-up ran, or the abandon time changed (113).
  housekeeping: [["settings", "housekeeping"]],
}
