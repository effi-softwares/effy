import type { OrderRow, OrdersSearch } from "./orderConsole"
import { toCsv, toListQuery } from "./orderConsole"
import { listOrders } from "./repo"

/**
 * The Orders CSV export — ONE implementation, two call sites (058 T065).
 *
 * ⚠ EXTRACTED FROM `OrderListScreen` when Today's Quick actions became its second caller. Two
 * exports would mean two CSV shapes, and the divergence would only ever be noticed in a spreadsheet
 * on someone else's desk — long after the change that caused it.
 */

/** ⚠ Capped: a CSV of a shop's entire history is a report, not an export button. */
const MAX_PAGES = 40

export async function collectOrders(search: OrdersSearch): Promise<OrderRow[]> {
  const all: OrderRow[] = []
  for (let p = 1; p <= MAX_PAGES; p++) {
    const res = await listOrders({ ...toListQuery(search), page: p })
    all.push(...res.items)
    if (all.length >= res.total || res.items.length === 0) break
  }
  return all
}

export function downloadOrdersCsv(rows: readonly OrderRow[]): void {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Fetch every matching order and hand the browser the file. Returns how many rows were exported. */
export async function exportOrdersCsv(search: OrdersSearch): Promise<number> {
  const rows = await collectOrders(search)
  downloadOrdersCsv(rows)
  return rows.length
}
