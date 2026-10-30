import { useQuery } from "@tanstack/react-query"

import type { OrdersSearch } from "../orderConsole"
import { orderListQuery } from "../queries"

export interface OrderNeighbour {
  id: string
  /** The list's view to open it with: a neighbour across a page edge carries its own page. */
  search: OrdersSearch
}

/**
 * Where an order sits in the order list it was opened from (the list's view rides in the order's address), and the
 * order before and after it — across a page edge too, by reading the next or previous page when it has to.
 */
export function useOrderNeighbours(fulfillmentId: string, search: OrdersSearch) {
  const list = useQuery(orderListQuery(search))
  const rows = list.data?.items ?? []
  const index = rows.findIndex((r) => r.id === fulfillmentId)
  const page = list.data?.page ?? 1
  const pageSize = list.data?.pageSize ?? 25
  const total = list.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const needPrev = index === 0 && page > 1
  const needNext = index >= 0 && index === rows.length - 1 && page < pageCount
  const prevPage = useQuery({ ...orderListQuery({ ...search, page: page - 1 }), enabled: needPrev })
  const nextPage = useQuery({ ...orderListQuery({ ...search, page: page + 1 }), enabled: needNext })

  if (index < 0) return { position: null, total: null, prev: null, next: null }
  const prev: OrderNeighbour | null =
    index > 0
      ? { id: rows[index - 1]!.id, search }
      : needPrev && prevPage.data?.items.length
        ? { id: prevPage.data.items[prevPage.data.items.length - 1]!.id, search: { ...search, page: page - 1 } }
        : null
  const next: OrderNeighbour | null =
    index < rows.length - 1
      ? { id: rows[index + 1]!.id, search }
      : needNext && nextPage.data?.items.length
        ? { id: nextPage.data.items[0]!.id, search: { ...search, page: page + 1 } }
        : null
  return { position: (page - 1) * pageSize + index + 1, total, prev, next }
}
