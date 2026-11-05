import { useEffect, useState, type ReactNode } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, BarChart3, Download, Table2 } from "lucide-react"

import { cn } from "@effy/design-system"
import { Button, ToggleGroup, ToggleGroupItem } from "@effy/design-system/ui"
import type { InsightsPage, InsightsRange, ShopInsightsDTO } from "@effy/shared-types"
import { ErrorState } from "@effy/web-kit/console"
import { StaticTable } from "@effy/web-kit/data-table"
import { Bone, Loading, MoreActions, PageHeader } from "@effy/web-kit/patterns"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

import { BoardSection } from "@/components/console/BoardSection"
import { MotionScope } from "@/components/console/MotionScope"
import { useNow } from "@/features/today/useNow"
import { track } from "@/lib/telemetry"

import { CHARTS, chartOf, ChartCard, type ChartDef } from "./charts"
import { Delta } from "./Delta"
import { downloadInsightsCsv } from "./exportCsv"
import { freshness, PAGE_PATH, periodNames } from "./model"
import { MEASURES, OverviewPage, ProductsPage, SalesPage, ServicePage, StockPage } from "./pages"
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
  { page: "stock", label: "Stock" },
  { page: "service", label: "Service" },
]

const searchOf = (range: InsightsRange): Record<string, string> => (range === "7d" ? {} : { range })

function RangeSwitch({ range, to, params, tour }: { range: InsightsRange; to: string; params?: Record<string, string>; tour?: string }) {
  const navigate = useNavigate()
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      aria-label="Range"
      data-tour={tour}
      value={range}
      onValueChange={(v) => {
        if (!v) return
        track({ name: "insights_range_changed", range: v as InsightsRange })
        void navigate({ to: to as never, params: params as never, search: searchOf(v as InsightsRange) as never })
      }}
    >
      {RANGES.map((r) => (
        <ToggleGroupItem key={r.value} value={r.value} className="px-4">
          {r.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function InsightsScreen({ page, range }: { page: InsightsTab; range: InsightsRange }) {
  const insights = useQuery(insightsQuery(range))
  useTourPage(page === "overview" ? "insights" : `insights-${page}`, { status: tourStatus(insights) })
  const now = useNow(60_000)
  const dto = insights.data

  useEffect(() => {
    track({ name: "insights_viewed", range })
  }, [range])

  return (
    <MotionScope>
      <div className="ef-board flex min-w-0 flex-col gap-2">
        <PageHeader
          title="Insights"
          description={dto ? `Your goods only · ${freshness(dto.computedAt, now)}` : "Your goods only"}
          actions={
            <>
              <RangeSwitch range={range} to={PAGE_PATH[page]} tour="insights.range" />
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

        <nav aria-label="Insights pages" data-tour="insights.pages" className="mb-6 flex gap-5 overflow-x-auto border-b [scrollbar-width:none]">
          {TABS.map((t) => (
            <Link
              key={t.page}
              to={PAGE_PATH[t.page]}
              search={searchOf(range) as never}
              aria-current={page === t.page ? "page" : undefined}
              className={cn(
                "relative flex h-11 items-center font-medium whitespace-nowrap no-underline",
                page === t.page ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {insights.isError && !dto ? (
          // The range and the pages stay, so another range or page can be tried.
          <ErrorState error={insights.error} onRetry={() => void insights.refetch()} />
        ) : !dto ? (
          <InsightsSkeleton page={page} range={range} />
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
          <ProductsPage dto={dto} />
        ) : page === "stock" ? (
          <StockPage dto={dto} />
        ) : (
          <ServicePage dto={dto} />
        )}
      </div>
    </MotionScope>
  )
}

// ---- one chart, on its own page -------------------------------------------------------------------------------------

export function ChartScreen({ slug, range }: { slug: string; range: InsightsRange }) {
  const insights = useQuery(insightsQuery(range))
  useTourPage("insights-chart", { status: tourStatus(insights) })
  const now = useNow(60_000)
  const [asTable, setAsTable] = useState(false)
  const chart = chartOf(slug)
  const dto = insights.data

  useEffect(() => {
    track({ name: "insights_chart_opened", chart: slug })
  }, [slug])

  if (!chart) {
    return (
      <div className="py-16 text-center">
        <p className="text-2xl font-semibold tracking-[-.02em]">There is no such chart</p>
        <p className="text-muted-foreground">
          <Link to="/insights">Back to Insights</Link>
        </p>
      </div>
    )
  }
  const pageName = chart.page === "sales" ? "Sales" : "Service"
  const others = CHARTS.filter((c) => c.page === chart.page && c.slug !== chart.slug && !!c.measure === !!chart.measure).slice(0, 3)

  return (
    <MotionScope>
      <div className="ef-board flex min-w-0 flex-col">
        <Link
          to={PAGE_PATH[chart.page]}
          search={searchOf(range) as never}
          data-tour="insights.back"
          className="mb-1.5 inline-flex w-fit items-center gap-1 text-[13.5px] font-medium text-muted-foreground no-underline hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-[15px]" />
          {pageName}
        </Link>
        <PageHeader
          title={chart.title}
          description={dto ? `${periodNames(range)[0]} · Your goods only · ${freshness(dto.computedAt, now)}` : "Your goods only"}
          actions={
            <>
              <RangeSwitch range={range} to="/insights/$section/$chart" params={{ section: chart.page, chart: chart.slug }} tour="insights.range" />
              <Button variant="outline" disabled={!dto} onClick={() => dto && downloadChart(chart, dto)}>
                <Download aria-hidden="true" />
                Export
              </Button>
            </>
          }
        />
        {insights.isError && !dto ? (
          <ErrorState error={insights.error} onRetry={() => void insights.refetch()} />
        ) : !dto ? (
          <Loading label="Loading the chart">
            <Bone kind="heading" className="mb-5 h-8 w-full max-w-[520px]" />
            <Bone kind="block" className="h-[340px] w-full" />
          </Loading>
        ) : (
          <>
            <div data-tour="insights.chart" className="mt-2">
              {chart.measure ? (
                <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
                  <b className="text-[44px] leading-none font-semibold tracking-[-0.035em] tabular-nums max-md:text-4xl">{chart.measure.value(dto)}</b>
                  <Delta figure={chart.measure.figure(dto)} unit={chart.measure.unit} goodWhenUp={chart.measure.goodWhenUp} label={`on ${dto.briefing.comparedWith}`} />
                </div>
              ) : (
                <p role="status" className="mb-5 max-w-[900px] text-[26px] leading-[34px] font-semibold tracking-[-0.022em] text-pretty max-md:text-xl max-md:leading-7">
                  {chart.finding(dto)}.
                </p>
              )}
              <div className="mb-2 flex justify-end">
                <Button variant="ghost" size="sm" data-tour="insights.view-toggle" onClick={() => setAsTable(!asTable)}>
                  {asTable ? <BarChart3 aria-hidden="true" /> : <Table2 aria-hidden="true" />}
                  {asTable ? "Show chart" : "Show table"}
                </Button>
              </div>
              {asTable ? <ChartTable chart={chart} dto={dto} /> : chart.full(dto)}
            </div>
            <section aria-labelledby="in-how-t" className="mt-7 max-w-[720px] border-t pt-4">
              <h2 id="in-how-t" className="mb-1 text-[15px] font-semibold">
                How it’s counted
              </h2>
              <p className="text-muted-foreground">{chart.how}</p>
            </section>
            {others.length ? (
              <BoardSection id="in-more-t" className="mt-10" title={`More on ${pageName}`}>
                <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-md:grid-cols-1">
                  {others.map((c) => (
                    <ChartCard key={c.slug} chart={c} dto={dto} search={searchOf(range)} />
                  ))}
                </div>
              </BoardSection>
            ) : null}
          </>
        )}
      </div>
    </MotionScope>
  )
}

function ChartTable({ chart, dto }: { chart: ChartDef; dto: ShopInsightsDTO }) {
  const { head, rows } = chart.table(dto)
  return (
    <StaticTable
      label={chart.title}
      rows={rows.map((r, i) => ({ id: String(i), cells: r }))}
      getRowId={(r) => r.id}
      columns={head.map((h, i) => ({ id: `c${i}`, header: h || " ", cell: ({ row }: { row: { original: { cells: (string | number)[] } } }) => String(row.original.cells[i] ?? "") }))}
    />
  )
}

/** The chart's table as a spreadsheet: exactly the numbers the table view shows. */
function downloadChart(chart: ChartDef, dto: ShopInsightsDTO) {
  const { head, rows } = chart.table(dto)
  const cell = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  const csv = [head, ...rows].map((r) => r.map(cell).join(",")).join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `insights-${chart.slug}-${dto.range}.csv`
  a.click()
  URL.revokeObjectURL(url)
  track({ name: "insights_exported", range: dto.range })
}

/** Each page's own shape while a range reads: its headings written out, a bone where a value goes. */
function InsightsSkeleton({ page, range }: { page: InsightsTab; range: InsightsRange }) {
  const cards = (n: number, cols = "grid-cols-3") => (
    <div className={cn("grid gap-4 max-lg:grid-cols-2 max-md:grid-cols-1", cols)}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="grid gap-2 rounded-lg border px-4 pt-4 pb-3">
          <Bone className="h-3 w-24" />
          <Bone kind="heading" className="h-4 w-48" />
          <Bone kind="block" className="mt-2 h-[76px] w-full" />
          <Bone className="mt-1.5 h-3 w-28" />
        </div>
      ))}
    </div>
  )
  const section = (title: string, body: ReactNode, className?: string) => (
    <section className={className}>
      <div className="mb-2.5 flex min-h-9 items-center">
        <h2 className="text-[15px] leading-6 font-semibold">{title}</h2>
      </div>
      {body}
    </section>
  )
  const rows = (n: number) => (
    <ul className="border-t">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="flex justify-between border-b py-2.5">
          <Bone className="h-3 w-40" />
          <Bone className="h-3 w-14" />
        </li>
      ))}
    </ul>
  )
  const body: Record<InsightsTab, ReactNode> = {
    overview: (
      <>
        <Bone kind="heading" className="h-7 w-full max-w-[640px]" />
        <Bone kind="heading" className="mt-2 mb-8 h-7 w-full max-w-[380px]" />
        <div className="ef-board-layout">
          <div className="ef-board-main">
            {section(
              "Sales",
              <div className="grid grid-cols-4 border-y max-md:grid-cols-2">
                {MEASURES.map((x) => (
                  <div key={x.value} className="grid gap-1.5 px-3.5 py-3">
                    <span className="text-[13px] text-muted-foreground">{x.label}</span>
                    <Bone kind="heading" className="h-6 w-20" />
                  </div>
                ))}
              </div>,
            )}
            {section("Look closer", cards(4, "grid-cols-2"))}
          </div>
          <div className="ef-board-rail">{section("Worth doing", rows(6))}</div>
        </div>
      </>
    ),
    sales: (
      <>
        <p className="text-muted-foreground">Sales, {periodNames(range)[0].toLowerCase()}</p>
        <Bone kind="heading" className="mb-6 h-12 w-56" />
        <Bone kind="block" className="h-[260px] w-full" />
        {section("Look closer", cards(5), "mt-10")}
      </>
    ),
    products: (
      <div className="ef-board-layout">
        <div className="ef-board-main">{section(`Best sellers, ${periodNames(range)[0].toLowerCase()}`, rows(8))}</div>
        <div className="ef-board-rail">
          {section("Moving up", rows(2))}
          {section("Slipping", rows(2))}
          {section("Selling but out of stock", rows(2))}
        </div>
      </div>
    ),
    stock: (
      <div className="ef-board-layout">
        <div className="ef-board-main">
          {section("Running out", rows(4))}
          {section("Sold out", rows(3))}
        </div>
        <div className="ef-board-rail">
          {section("Not sold in 30 days", rows(3))}
          {section("Written off", rows(3))}
        </div>
      </div>
    ),
    service: (
      <>
        {section("Your four measures", cards(4, "grid-cols-4"))}
        {section("Look closer", cards(3), "mt-10")}
      </>
    ),
  }
  return <Loading label="Loading insights">{body[page]}</Loading>
}
