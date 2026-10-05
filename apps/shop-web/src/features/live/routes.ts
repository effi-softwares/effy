import type { LiveKind } from "@effy/shared-types"
import type { QueryKey } from "@tanstack/react-query"

// Which of this console's queries show which kind of thing (071). Query-key PREFIXES: an update
// re-reads whatever is on screen beneath them and marks the rest stale.
//
// ⚠ TODAY IS UNDER EVERY KIND. Its one cache entry carries the pick backlog, what is out of stock
// and the attention list (058 FR-006: one query, one source) — so each of those changing means the
// same re-read.
//
// The roots are spelled out here, not imported from each slice's `queries.ts`: those constants are
// private to their slices, and `routes.test.ts` fails if a key written here matches no query the
// console declares.
const TODAY: QueryKey = ["shop", "today"]
const FULFILLMENT: QueryKey = ["shop", "fulfillment"]
const STOCK: QueryKey = ["shop", "stock"]

export const LIVE_ROUTES: Partial<Record<LiveKind, readonly QueryKey[]>> = {
  orders: [TODAY, FULFILLMENT],
  stock: [TODAY, STOCK],
  attention: [TODAY],
}
