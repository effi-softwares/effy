import { type OrderRow, type OrdersSearch, toCsv, toListQuery } from "./orderConsole"
import { listOrders } from "./repo"

const MAX_PAGES = 40

async function collectOrders(search: OrdersSearch): Promise<OrderRow[]> {
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

export async function exportOrdersCsv(search: OrdersSearch): Promise<number> {
  const rows = await collectOrders(search)
  downloadOrdersCsv(rows)
  return rows.length
}
