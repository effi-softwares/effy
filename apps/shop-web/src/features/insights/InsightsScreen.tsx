import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import type { InsightsRange } from "@effy/shared-types"
import { Download } from "lucide-react"

import { Button, Skeleton, ToggleGroup, ToggleGroupItem } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { PageHeader } from "@effy/web-kit/patterns"

import { todayQuery } from "@/features/today/queries"
import { useNow } from "@/features/today/useNow"
import { track } from "@/lib/telemetry"

import { BarChart } from "./BarChart"
import { downloadInsightsCsv } from "./exportCsv"
import { GRAIN_LABEL, money, RANGE_TITLE, windowSubtitle } from "./model"
import { MetricStrip } from "./MetricStrip"
import { QualityStrip } from "./QualityStrip"
import { insightsQuery } from "./queries"
import { SecondaryStrip } from "./SecondaryStrip"
import { TopProducts } from "./TopProducts"

const RANGES: Array<{ value: InsightsRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
]

export function InsightsScreen() {
  const [range, setRange] = useState<InsightsRange>("today")
  const insights = useQuery(insightsQuery(range))
  const today = useQuery(todayQuery)
  const now = useNow(60_000)

  useEffect(() => {
    track({ name: "insights_viewed", range })
  }, [range])

  const dto = insights.data

  if (insights.isError) {
    return <ErrorState error={insights.error} onRetry={() => void insights.refetch()} />
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 max-md:gap-4">
      <PageHeader
        title={RANGE_TITLE[range]}
        description={dto ? windowSubtitle(dto, now) : "\u00a0"}
        actions={
          <>
            <ToggleGroup
              type="single"
              variant="outline"
              aria-label="Range"
              value={range}
              onValueChange={(v) => {
                if (!v) return
                setRange(v as InsightsRange)
                track({ name: "insights_range_changed", range: v as InsightsRange })
              }}
            >
              {RANGES.map((r) => (
                <ToggleGroupItem key={r.value} value={r.value} className="px-4">
                  {r.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button
              variant="outline"
              disabled={!dto}
              onClick={() => {
                if (!dto) return
                downloadInsightsCsv(dto)
                track({ name: "insights_exported", range })
              }}
            >
              <Download aria-hidden="true" />
              Export CSV
            </Button>
          </>
        }
      />

      {!dto ? (
        <div className="grid gap-6" aria-busy="true" aria-label="Loading insights">
          <Skeleton className="h-28 w-full rounded-lg" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
        </div>
      ) : (
        <>
          <MetricStrip dto={dto} backlog={today.data?.backlog} />

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <BarChart
              series="primary"
              title="Revenue"
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

          <QualityStrip dto={dto} />

          <TopProducts products={dto.topProducts} range={dto.range} currency={dto.currency} />

          <section className="grid gap-3">
            <h2 className="text-base font-semibold">Behind the numbers</h2>
            <SecondaryStrip dto={dto} backlog={today.data?.backlog} />
          </section>
        </>
      )}
    </div>
  )
}
