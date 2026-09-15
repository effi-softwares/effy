import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

import type { ShopBacklogDTO } from "@effy/shared-types"
import { Skeleton } from "@effy/design-system/ui"

import { deltaText, money } from "@/features/insights/model"
import { insightsQuery } from "@/features/insights/queries"

import { unitsToPack } from "./model"

/**
 * "Today at a glance" — a summary, with the analysis one click away (058, FR-014).
 *
 * ⚠ IT READS `insightsQuery("today")` — THE SAME CACHE ENTRY INSIGHTS READS. That is what makes
 * "these two screens agree" true by construction rather than by coincidence: there is one request,
 * one answer, and both screens render it. Computing today's revenue here from the operational
 * snapshot would be a second implementation of the same question, which is the exact mistake 052
 * deleted (`summarizeFulfillment`) and 033 found in the availability flag.
 *
 * ⚠ AND THE FOURTH CELL COMES FROM THE OPERATIONAL SNAPSHOT, for the opposite reason. "Awaiting pick"
 * is live work: a minute-old figure sends someone to a shelf for an order already packed.
 *
 * ⚠ FOUR FIGURES IN ONE BORDERED STRIP, not four cards (Principle V's layout doctrine).
 */
export function TodayGlance({ backlog }: { backlog: ShopBacklogDTO | undefined }) {
  const insights = useQuery(insightsQuery("today"))
  const dto = insights.data

  const cells = [
    {
      label: "Revenue today",
      value: dto ? money(dto.primary.revenue.value, dto.currency) : null,
      note: dto ? deltaText(dto.primary.revenue, dto.comparison.basis) : "",
    },
    {
      label: "Orders today",
      value: dto ? dto.primary.orders.value : null,
      note: dto ? `${dto.primary.orders.lastHour ?? 0} in the last hour` : "",
    },
    {
      label: "Average order value",
      value: dto ? money(dto.primary.averageOrderValue.value, dto.currency) : null,
      note: dto ? deltaText(dto.primary.averageOrderValue, dto.comparison.basis) : "",
    },
    {
      label: "Awaiting pick",
      value: backlog ? String(backlog.awaitingPick.orders) : null,
      note: backlog ? unitsToPack(backlog.awaitingPick.units) : "",
    },
  ]

  return (
    <section className="overflow-hidden rounded-[var(--radius)] border">
      <header className="flex items-center gap-3 border-b px-[18px] py-[13px]">
        <h2 className="text-[13px] font-semibold">Today at a glance</h2>
        <div className="flex-1" />
        <Link
          to="/insights"
          className="text-muted-foreground hover:text-foreground text-[13px] font-medium no-underline"
        >
          Full insights →
        </Link>
      </header>
      {/* Rules as a grid gap — at two columns on a phone the second row would otherwise draw one
          against the card's left edge (see MetricStrip). */}
      <dl className="bg-border grid grid-cols-2 gap-px sm:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="bg-background grid min-w-0 gap-1 px-[18px] py-[15px]">
            <dt className="text-muted-foreground truncate text-xs font-medium">{c.label}</dt>
            <dd className="truncate text-[22px] font-semibold tracking-[-0.02em] tabular-nums">
              {c.value ?? <Skeleton className="h-6 w-16" />}
            </dd>
            <dd className="text-muted-foreground truncate text-[11.5px]">{c.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
