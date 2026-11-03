import { useEffect } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { Download } from "lucide-react"

import type { InsightsPage, InsightsRange } from "@effy/shared-types"
import { cn } from "@effy/design-system"
import { ToggleGroup, ToggleGroupItem } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { Bone, Loading, MoreActions, PageHeader } from "@effy/web-kit/patterns"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

import { MotionScope } from "@/components/console/MotionScope"
import { todayQuery } from "@/features/today/queries"
import { useNow } from "@/features/today/useNow"
import { track } from "@/lib/telemetry"

import { downloadInsightsCsv } from "./exportCsv"
import { freshness, PAGE_PATH } from "./model"
import { OverviewPage, ProductsPage, SalesPage, ServicePage } from "./pages"
import { insightsQuery } from "./queries"

const RANGES: { value: InsightsRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
]

export type InsightsTab = "overview" | InsightsPage

const TABS: { page: InsightsTab; label: string }[] = [
  { page: "overview", label: "Overview" },
  { page: "sales", label: "Sales" },
  { page: "products", label: "Products" },
  { page: "service", label: "Service" },
]

export function InsightsScreen({ page, range }: { page: InsightsTab; range: InsightsRange }) {
  const navigate = useNavigate()
  const insights = useQuery(insightsQuery(range))
  // The one source for what is out of stock, shared with Today.
  const today = useQuery(todayQuery)
  useTourPage(page === "overview" ? "insights" : `insights-${page}`, { status: tourStatus(insights) })
  const now = useNow(60_000)
  const dto = insights.data
  const search = range === "7d" ? {} : { range }

  useEffect(() => {
    track({ name: "insights_viewed", range })
  }, [range])

  if (insights.isError) {
    return <ErrorState error={insights.error} onRetry={() => void insights.refetch()} />
  }

  return (
    <MotionScope>
      <div className="flex min-w-0 flex-col gap-2">
        <PageHeader
          title="Insights"
          description={dto ? `Your goods only · ${freshness(dto.computedAt, now)}` : " "}
          actions={
            <>
              <ToggleGroup
                type="single"
                variant="outline"
                aria-label="Range"
                data-tour="insights.range"
                value={range}
                onValueChange={(v) => {
                  if (!v) return
                  track({ name: "insights_range_changed", range: v as InsightsRange })
                  void navigate({ to: PAGE_PATH[page], search: v === "7d" ? {} : { range: v as InsightsRange } })
                }}
              >
                {RANGES.map((r) => (
                  <ToggleGroupItem key={r.value} value={r.value} className="px-4">
                    {r.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <MoreActions
                tour="page-more"
                actions={[
                  {
                    label: "Export CSV",
                    icon: Download,
                    disabled: !dto,
                    onSelect: () => {
                      if (!dto) return
                      downloadInsightsCsv(dto)
                      track({ name: "insights_exported", range })
                    },
                  },
                ]}
              />
            </>
          }
        />

        <nav
          aria-label="Insights pages"
          data-tour="insights.pages"
          className="mb-5 flex gap-5 overflow-x-auto border-b [scrollbar-width:none]"
        >
          {TABS.map((t) => (
            <Link
              key={t.page}
              to={PAGE_PATH[t.page]}
              search={search}
              aria-current={page === t.page ? "page" : undefined}
              className={cn(
                "relative flex h-11 items-center font-medium whitespace-nowrap no-underline",
                page === t.page
                  ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {!dto ? (
          <InsightsSkeleton />
        ) : dto.computedAt === null ? (
          <div className="py-16 text-center">
            <p className="text-2xl font-semibold tracking-[-.02em]">Your figures are being prepared</p>
            <p className="text-muted-foreground">They appear here within a few minutes of your first order.</p>
          </div>
        ) : page === "overview" ? (
          <OverviewPage dto={dto} />
        ) : page === "sales" ? (
          <SalesPage dto={dto} />
        ) : page === "products" ? (
          <ProductsPage dto={dto} today={today.data} />
        ) : (
          <ServicePage dto={dto} />
        )}
      </div>
    </MotionScope>
  )
}

/** The page's own shape while a range reads. */
function InsightsSkeleton() {
  return (
    <Loading label="Loading insights">
      <div className="grid gap-3.5">
        <Bone kind="title" className="h-10 w-[760px] max-w-full" />
        <Bone kind="title" className="h-10 w-[520px] max-w-full" />
      </div>
      <div className="mt-7 mb-9 grid grid-cols-3 gap-8 max-md:grid-cols-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-2">
            <Bone className="w-3/4" />
            <Bone kind="small" className="w-full" />
          </div>
        ))}
      </div>
      <h2 className="mb-3 text-[15px] font-semibold">Revenue</h2>
      <Bone kind="block" className="h-70 w-full" />
    </Loading>
  )
}
