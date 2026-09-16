import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import type { InsightsRange } from "@effy/shared-types"
import { Button, Skeleton } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { todayQuery } from "@/features/today/queries"
import { useNow } from "@/features/today/useNow"
import { track } from "@/lib/telemetry"

import { BarChart } from "./BarChart"
import { downloadInsightsCsv } from "./exportCsv"
import { GRAIN_LABEL, money, RANGE_TITLE, windowSubtitle } from "./model"
import { MetricStrip } from "./MetricStrip"
import { insightsQuery } from "./queries"
import { SecondaryStrip } from "./SecondaryStrip"
import { TopProducts } from "./TopProducts"

const RANGES: Array<{ value: InsightsRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
]

/**
 * INSIGHTS — how the shop is doing (058, US3).
 *
 * ⚠ EVERYTHING HERE RESPONDS TO ONE CONTROL. One range, one window, one comparison basis, applied to
 * every figure and both charts at once. The alternative — per-card date pickers — produces a screen
 * where two numbers beside each other quietly describe different weeks.
 *
 * ⚠ TWO SOURCES, DELIBERATELY. The analytics come from the rollups (`insightsQuery`); "Awaiting pick"
 * and "Unfulfilled units" come from `todayQuery`, the same cache entry Today renders from. Those two
 * are live work, and a figure about work in progress that is a minute stale is a figure that sends
 * someone to a shelf for an order already packed (FR-006/FR-025).
 */
export function InsightsScreen() {
  const [range, setRange] = useState<InsightsRange>("today")
  const insights = useQuery(insightsQuery(range))
  const today = useQuery(todayQuery)
  const now = useNow(60_000)

  useEffect(() => {
    track({ name: "insights_viewed", range })
    // Re-fires on a range change too: which windows operators actually look at is the question this
    // event exists to answer.
  }, [range])

  const dto = insights.data

  if (insights.isError) {
    return <ErrorState error={insights.error} onRetry={() => void insights.refetch()} />
  }

  return (
    <div className="grid gap-[30px]">
      <header className="flex flex-wrap items-center gap-3">
        <div className="grid min-w-0 gap-[3px]">
          <h1 className="text-[17px] font-semibold tracking-[-0.02em]">{RANGE_TITLE[range]}</h1>
          <p className="text-muted-foreground text-[12.5px]">
            {dto ? windowSubtitle(dto, now) : <Skeleton className="h-4 w-80" />}
          </p>
        </div>
        <div className="min-w-3 flex-1" />

        {/* The segmented control: one range for the whole page. */}
        <div className="bg-muted flex gap-0.5 rounded-lg p-[3px]">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => {
                setRange(r.value)
                track({ name: "insights_range_changed", range: r.value })
              }}
              className={
                r.value === range
                  ? "bg-background h-7 rounded-md px-3 text-[13px] font-medium"
                  : "text-muted-foreground hover:text-foreground h-7 rounded-md px-3 text-[13px]"
              }
              aria-pressed={r.value === range}
            >
              {r.label}
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          className="h-8 px-3 text-[13px]"
          disabled={!dto}
          onClick={() => {
            if (!dto) return
            downloadInsightsCsv(dto)
            track({ name: "insights_exported", range })
          }}
        >
          Export CSV
        </Button>
      </header>

      {!dto ? (
        <div className="grid gap-[30px]">
          <Skeleton className="h-[104px] w-full rounded-[var(--radius)]" />
          <Skeleton className="h-[62px] w-full rounded-[var(--radius)]" />
          <Skeleton className="h-[220px] w-full" />
        </div>
      ) : (
        <>
          <MetricStrip dto={dto} backlog={today.data?.backlog} />
          <SecondaryStrip dto={dto} backlog={today.data?.backlog} />

          <div className="grid items-start gap-8 [grid-template-columns:minmax(0,1fr)] min-[1060px]:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
            <BarChart
              series="primary"
              title="Revenue"
              // ⚠ "Goods · AUD", not the design's "SEK incl. VAT": per-item GST is unmodelled
              // (052 R13), so any tax claim here would be invented — and "goods" names the basis,
              // which is what stops this being read as the order totals the Orders list shows.
              subtitle={`${GRAIN_LABEL[dto.series.grain]} · Goods · ${dto.currency}`}
              total={money(dto.series.revenueTotal.value, dto.currency)}
              figure={dto.series.revenueTotal}
              basis={dto.comparison.basis}
              buckets={dto.series.buckets}
              valueOf={(b) => Number(b.revenue)}
            />
            <BarChart
              series="secondary"
              title="Order volume"
              subtitle={`${GRAIN_LABEL[dto.series.grain]} · paid orders`}
              total={`${dto.series.ordersTotal.value} orders`}
              figure={dto.series.ordersTotal}
              basis={dto.comparison.basis}
              buckets={dto.series.buckets}
              valueOf={(b) => b.orders}
            />
          </div>

          <TopProducts products={dto.topProducts} range={dto.range} currency={dto.currency} />
        </>
      )}
    </div>
  )
}
