import type { LiveKind } from "@effy/shared-types"
import type { QueryKey } from "@tanstack/react-query"

const TODAY: QueryKey = ["shop", "today"]
const FULFILLMENT: QueryKey = ["shop", "fulfillment"]
const STOCK: QueryKey = ["shop", "stock"]
const TAXONOMY: QueryKey = ["shop", "catalog", "taxonomy"]

export const LIVE_ROUTES: Partial<Record<LiveKind, readonly QueryKey[]>> = {
  orders: [TODAY, FULFILLMENT],
  stock: [TODAY, STOCK],
  attention: [TODAY],
  // Effy changed the category tree or a form (101): the picker and any open details form re-read.
  taxonomy: [TAXONOMY],
}
