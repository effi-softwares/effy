import type { LiveKind } from "@effy/shared-types"
import type { QueryKey } from "@tanstack/react-query"

// Which of this console's queries show which kind of thing (query-key prefixes). Today is under every
// kind: its one entry carries the backlog, out-of-stock and the attention list. The roots are spelled out,
// not imported (they are private to their slices); `routes.test.ts` fails a key that matches no query.
const TODAY: QueryKey = ["shop", "today"]
const FULFILLMENT: QueryKey = ["shop", "fulfillment"]
const STOCK: QueryKey = ["shop", "stock"]

export const LIVE_ROUTES: Partial<Record<LiveKind, readonly QueryKey[]>> = {
  orders: [TODAY, FULFILLMENT],
  stock: [TODAY, STOCK],
  attention: [TODAY],
}
