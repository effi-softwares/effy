import type { ShopInsightsDTO } from "@effy/shared-types"

import { freshness, RANGE_TITLE } from "./model"

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
    ["Average order value", dto.primary.averageOrderValue.value, dto.primary.averageOrderValue.previous ?? ""],
    ["Refunds", dto.secondary.refunds.value, dto.secondary.refunds.previous ?? ""],
    ["Can't supply", dto.secondary.cantSupply.value, dto.secondary.cantSupply.previous ?? ""],
    ["Cancelled", dto.secondary.cancelled.value, dto.secondary.cancelled.previous ?? ""],
    ["Found rate (%)", dto.quality.foundRate?.value ?? "", dto.quality.foundRate?.previous ?? ""],
    ["Can't-supply rate (%)", dto.quality.cantSupplyRate?.value ?? "", dto.quality.cantSupplyRate?.previous ?? ""],
    [
      "Average time to ready (seconds)",
      dto.quality.averageTimeToReady?.value ?? "",
      dto.quality.averageTimeToReady?.previous ?? "",
    ],
    [],
    [`${dto.series.grain} starting`, "Revenue", "Orders"],
    ...dto.series.buckets.map((b) => [b.start, b.revenue, String(b.orders)]),
    [],
    ["Product", "SKU", "Units", "Revenue"],
    ...dto.topProducts.map((p) => [p.name, p.sku ?? "", String(p.units), p.revenue]),
  ]

  return rows.map((r) => r.map(escapeCell).join(",")).join("\n")
}

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function downloadInsightsCsv(dto: ShopInsightsDTO): void {
  const blob = new Blob([insightsCsv(dto)], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `effy-insights-${dto.range}-${dto.window.to.slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
