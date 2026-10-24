import type { ShopBacklogDTO, ShopInsightsDTO } from "@effy/shared-types"
import { cn } from "@effy/design-system"

import { deltaText, deltaToneClass, metricLabel, money, RANGE_SUFFIX } from "./model"

/**
 * The primary metric strip: one bordered container divided by rules, not tiles. "Awaiting pick" and
 * "Unfulfilled units" come from `todayQuery`, not the analytics payload, so they are live and agree with
 * Today.
 */
export function MetricStrip({
  dto,
  backlog,
}: {
  dto: ShopInsightsDTO
  backlog: ShopBacklogDTO | undefined
}) {
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

  // The rules are a 1px grid gap over the border colour, not per-cell left borders. At three
  // breakpoints the cells wrap, and `border-l` + `first:border-l-0` leaves the leftmost cell of every
  // wrapped row drawing a rule against the container's own edge — the dangling rule the brief warns
  // about. A gap draws only between cells, at every width, with no nth-child arithmetic.
  // One bordered row of figures, not five cards. The last two are live work, not results — blue.
  return (
    <dl className="sh-kpis">
      {cells.map((c, i) => (
        <div key={c.label} className={cn("sh-kpi", i >= 3 && "is-live")}>
          <dt className="sh-kpi__label">
            {i >= 3 ? <span aria-hidden="true" className="bo-dot bo-dot--busy" /> : null}
            {c.label}
          </dt>
          <dd className="sh-kpi__value">{c.value}</dd>
          {/* The glyph carries the direction (deltaText writes ▲/▼), so colour never says it alone. */}
          <dd className={cn("sh-kpi__sub", "tone" in c && c.tone ? c.tone : null)}>{c.note}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The window suffix, exported for the tests that pin the label wording. */
export { RANGE_SUFFIX }
