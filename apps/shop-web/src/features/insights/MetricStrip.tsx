import type { ShopBacklogDTO, ShopInsightsDTO } from "@effy/shared-types"
import { cn } from "@effy/design-system"

import { deltaText, deltaToneClass, metricLabel, money } from "./model"

export function MetricStrip({ dto, backlog }: { dto: ShopInsightsDTO; backlog: ShopBacklogDTO | undefined }) {
  const cells = [
    {
      label: metricLabel("Revenue", dto.range),
      value: money(dto.primary.revenue.value, dto.currency),
      note: deltaText(dto.primary.revenue, dto.comparison.basis),
      tone: deltaToneClass(dto.primary.revenue),
    },
    {
      label: metricLabel("Orders", dto.range),
      value: dto.primary.orders.value,
      note:
        dto.range === "today"
          ? `${dto.primary.orders.lastHour ?? 0} in the last hour`
          : `${dto.primary.orders.perDay ?? "0"} per day on average`,
    },
    {
      label: "Average order value",
      value: money(dto.primary.averageOrderValue.value, dto.currency),
      note: deltaText(dto.primary.averageOrderValue, dto.comparison.basis),
      tone: deltaToneClass(dto.primary.averageOrderValue),
    },
    {
      label: "Awaiting pick",
      value: backlog ? String(backlog.awaitingPick.orders) : "—",
      note: backlog?.awaitingPick.oldestPaidAt ? "Oldest still waiting" : "Nothing waiting",
    },
    {
      label: "Unfulfilled units",
      value: backlog ? String(backlog.awaitingPick.units) : "—",
      note: backlog ? `Across ${backlog.awaitingPick.orders} orders` : "",
    },
  ]

  return (
    <dl className="kpis">
      {cells.map((c, i) => (
        <div key={c.label} className={cn("kpi", i >= 3 && "is-live")}>
          <dt className="kpi__label">
            {i >= 3 ? <span aria-hidden="true" className="ef-dot ef-dot--busy" /> : null}
            {c.label}
          </dt>
          <dd className="kpi__value">{c.value}</dd>
          <dd className={cn("kpi__sub", "tone" in c && c.tone ? c.tone : null)}>{c.note}</dd>
        </div>
      ))}
    </dl>
  )
}
