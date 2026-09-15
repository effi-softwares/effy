import type { ShopInsightsDTO } from "@effy/shared-types"

import { freshness, RANGE_TITLE } from "./model"

/**
 * Export the figures ON SCREEN (058, FR-015).
 *
 * ⚠ IT SERIALISES THE PAYLOAD THE OPERATOR IS LOOKING AT, rather than asking the server for a second,
 * differently-computed version. A CSV that disagrees with the page it was exported from is the worst
 * kind of report: it gets mailed to someone who never saw the page.
 *
 * ⚠ IT STAMPS THE WINDOW AND THE COMPUTED-AT into the file. A spreadsheet outlives the screen, and a
 * column of numbers with no window attached is a number nobody can check later.
 */
export function insightsCsv(dto: ShopInsightsDTO, now = Date.now()): string {
  const rows: string[][] = [
    ["Effy shop insights", RANGE_TITLE[dto.range]],
    ["Window", `${dto.window.from} to ${dto.window.to}`],
    ["Compared with", `${dto.comparison.from} to ${dto.comparison.to}`],
    ["Figures", freshness(dto.computedAt, now)],
    ["Currency", dto.currency],
    [],
    ["Metric", "Value", "Previous"],
    ["Revenue (goods, less refunds)", dto.primary.revenue.value, dto.primary.revenue.previous ?? ""],
    ["Orders", dto.primary.orders.value, dto.primary.orders.previous ?? ""],
    [
      "Average order value",
      dto.primary.averageOrderValue.value,
      dto.primary.averageOrderValue.previous ?? "",
    ],
    ["Refunds", dto.secondary.refunds.value, dto.secondary.refunds.previous ?? ""],
    ["Can't supply", dto.secondary.cantSupply.value, dto.secondary.cantSupply.previous ?? ""],
    ["Cancelled", dto.secondary.cancelled.value, dto.secondary.cancelled.previous ?? ""],
    [],
    [`${dto.series.grain} starting`, "Revenue", "Orders"],
    ...dto.series.buckets.map((b) => [b.start, b.revenue, String(b.orders)]),
    [],
    ["Product", "SKU", "Units", "Revenue"],
    ...dto.topProducts.map((p) => [p.name, p.sku ?? "", String(p.units), p.revenue]),
  ]

  return rows.map((r) => r.map(escapeCell).join(",")).join("\n")
}

/** Quote anything a spreadsheet would otherwise split or reinterpret. */
function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Hand the browser the file. Named with the range and the day, so two exports never collide. */
export function downloadInsightsCsv(dto: ShopInsightsDTO): void {
  const blob = new Blob([insightsCsv(dto)], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `effy-insights-${dto.range}-${dto.window.to.slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
