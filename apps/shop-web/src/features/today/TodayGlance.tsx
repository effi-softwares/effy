import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

import type { ShopBacklogDTO } from "@effy/shared-types"
import { cn } from "@effy/design-system"
import { Button, Skeleton } from "@effy/design-system/ui"
import { DetailRows, Panel } from "@effy/web-kit/patterns"

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
    <Panel
      title="Today at a glance"
      description="Your goods only, since midnight."
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/insights">Full insights →</Link>
        </Button>
      }
    >
      <DetailRows
        tight
        rows={rows.map((r) => ({
          key: r.label,
          label: r.label,
          value: (
            <>
              {r.value === null ? (
                <Skeleton className="h-5 w-20" />
              ) : (
                <span className={cn("font-semibold tabular-nums", r.live && "text-primary")}>{r.value}</span>
              )}
              {r.note ? <span className="mt-0.5 block text-muted-foreground">{r.note}</span> : null}
            </>
          ),
        }))}
      />
    </Panel>
  )
}
