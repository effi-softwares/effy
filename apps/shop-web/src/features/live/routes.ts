import type { LiveKind } from "@effy/shared-types"
import type { QueryKey } from "@tanstack/react-query"

const TODAY: QueryKey = ["shop", "today"]
const FULFILLMENT: QueryKey = ["shop", "fulfillment"]
const STOCK: QueryKey = ["shop", "stock"]
const TAXONOMY: QueryKey = ["shop", "catalog", "taxonomy"]
const PRODUCTS: QueryKey = ["shop", "catalog", "products"]
const PRODUCT: QueryKey = ["shop", "catalog", "product"]
const INBOX: QueryKey = ["shop", "inbox"]

export const LIVE_ROUTES: Partial<Record<LiveKind, readonly QueryKey[]>> = {
  orders: [TODAY, FULFILLMENT],
  stock: [TODAY, STOCK],
  attention: [TODAY],
  // Effy changed the category tree or a form (101): the picker and any open details form re-read.
  taxonomy: [TAXONOMY],
  // Effy held, released or finished one of this shop's products (102).
  products: [PRODUCTS, PRODUCT],
  // Someone at this shop has a new notification, or read or archived one (110): each operator re-reads their own.
  inbox: [INBOX],
}
