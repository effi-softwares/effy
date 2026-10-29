import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import type { InsightsRange } from "@effy/shared-types"
import { Download } from "lucide-react"

import { Button, ToggleGroup, ToggleGroupItem } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { Bone, Loading, PageHeader, PanelSkeleton } from "@effy/web-kit/patterns"

import { todayQuery } from "@/features/today/queries"
import { useNow } from "@/features/today/useNow"
import { track } from "@/lib/telemetry"

import { BarChart } from "./BarChart"
import { downloadInsightsCsv } from "./exportCsv"
import { GRAIN_LABEL, metricLabel, money, RANGE_TITLE, windowSubtitle } from "./model"
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
        <InsightsSkeleton range={range} />
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

/** The page while a range reads: the same figure strip (its labels are known) and the two charts. */
function InsightsSkeleton({ range }: { range: InsightsRange }) {
  const labels = [
    metricLabel("Revenue", range),
    metricLabel("Orders", range),
    "Average order value",
    "Awaiting pick",
    "Unfulfilled units",
  ]
  return (
    <Loading label="Loading insights">
      <dl className="kpis">
        {labels.map((label, i) => (
          <div key={label} className={i >= 3 ? "kpi is-live" : "kpi"}>
            <dt className="kpi__label">{label}</dt>
            <dd className="kpi__value">
              <Bone kind="title" className="w-24" />
            </dd>
            <dd className="kpi__sub">
              <Bone kind="small" className="w-20" />
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {["Revenue", "Order volume"].map((title) => (
          <PanelSkeleton key={title} title={title} description flush>
            <div className="flex h-50 items-end gap-1 px-5 pt-5 pb-4">
              {[40, 65, 30, 80, 55, 70, 45].map((h, i) => (
                <Bone key={i} kind="block" className="min-w-0 flex-1 rounded-sm" style={{ height: `${h}%` }} />
              ))}
            </div>
          </PanelSkeleton>
        ))}
      </div>
    </Loading>
  )
}
