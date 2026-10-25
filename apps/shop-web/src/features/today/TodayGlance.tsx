import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

import type { ShopBacklogDTO } from "@effy/shared-types"
import { cn } from "@effy/design-system"
import { Skeleton } from "@effy/design-system/ui"

import { deltaText, money } from "@/features/insights/model"
import { insightsQuery } from "@/features/insights/queries"

import { unitsToPack } from "./model"

export function TodayGlance({ backlog }: { backlog: ShopBacklogDTO | undefined }) {
  const insights = useQuery(insightsQuery("today"))
  const dto = insights.data

  const rows = [
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
      live: true,
    },
  ]

  return (
    <section className="ef-panel min-w-0">
      <div className="ef-panel__head">
        <div className="min-w-0 flex-1">
          <h2 className="ef-panel__title">Today at a glance</h2>
          <p className="ef-panel__desc">Your goods only, since midnight.</p>
        </div>
        <Link to="/insights" className="text-sm font-medium text-foreground no-underline hover:underline">
          Full insights →
        </Link>
      </div>
      <div className="ef-panel__body py-1!">
        <dl className="ef-dl ef-dl--tight">
          {rows.map((r) => (
            <div key={r.label} className="ef-dl__row items-baseline">
              <dt>{r.label}</dt>
              <dd className="min-w-0">
                {r.value === null ? (
                  <Skeleton className="h-5 w-20" />
                ) : (
                  <span className={cn("font-semibold tabular-nums", r.live && "text-primary")}>{r.value}</span>
                )}
                {r.note ? <span className="ef-sub">{r.note}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
