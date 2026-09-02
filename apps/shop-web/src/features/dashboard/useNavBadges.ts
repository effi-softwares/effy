import { useQuery } from "@tanstack/react-query"

import { lowStockQuery } from "@/features/catalog/stockQueries"
import { fulfillmentQueueQuery } from "@/features/fulfillment/queries"

import { countsFrom } from "./model"

/**
 * Live counts beside the sidebar's nav items (US4, FR-006).
 *
 * ⚠ IT READS THE SAME CACHED QUERIES EVERY SCREEN READS, and adds no request of its own. The order
 * queue already polls every 15 seconds under its own key; subscribing to that cache means the rail's
 * count and the table's rows are the same data, so they cannot disagree. A dedicated
 * `/shop/v1/nav-counts` endpoint would be a second source for a fact the client already holds — the
 * `summarizeFulfillment` mistake 052 deleted, in a new place.
 *
 * ⚠ A ZERO IS NOT A BADGE. `NavList` renders only a positive count, so a caught-up shop shows a clean
 * rail rather than a row of noughts.
 */
export function useNavBadges(): Record<string, number | undefined> {
  const orders = useQuery(fulfillmentQueueQuery("active"))
  const lowStock = useQuery(lowStockQuery)

  const counts = countsFrom(orders.data?.items ?? [], lowStock.data ?? [])

  return {
    "/orders": counts.toPick,
    "/restock": counts.needsRestock,
  }
}
