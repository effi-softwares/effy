import { useState, type ReactNode } from "react"

import { Link } from "@tanstack/react-router"
import { m } from "motion/react"
import { ArrowDown, ArrowRight, ArrowUp, Archive, BarChart3, Check, ChevronDown, Clock, Hourglass, Lock, PackageX, Table2, TrendingDown, Users, type LucideIcon } from "lucide-react"

import { cn } from "@effy/design-system"
import { Button, ToggleGroup, ToggleGroupItem } from "@effy/design-system/ui"
import { type InsightsPage, type InsightsRange, type ShopInsightsDTO } from "@effy/shared-types"
import { StaticTable } from "@effy/web-kit/data-table"

import { BoardSection, CouldNotLoad } from "@/components/console/BoardSection"
import { RollingNumber } from "@/components/console/RollingNumber"
import { track } from "@/lib/telemetry"

import { CHARTS, ChartCard, MiniBarsH, PageCard } from "./charts"
import { Delta } from "./Delta"
import { ChartLegend, LineChart } from "./LineChart"
import {
  bucketLabels,
  headline,
  minutes,
  money,
  moneyCents,
  movers,
  PAGE_PATH,
  periodNames,
  plural,
  RANGE_IN,
  WORTH_TIER_WORDS,
  worthDoing,
  type WorthRow,
} from "./model"

type Dto = ShopInsightsDTO
const enter = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] } } as const
const searchOf = (range: InsightsRange): Record<string, string> => (range === "7d" ? {} : { range })

function PageLink({ page, range, children, className }: { page: InsightsPage | "overview"; range: InsightsRange; children: ReactNode; className?: string }) {
  return (
    <Link to={PAGE_PATH[page]} search={searchOf(range) as never} className={className}>
      {children}
    </Link>
  )
}

// ---- the line chart, with its table ---------------------------------------------------------------------------------

type Measure = "revenue" | "orders" | "aov" | "ipo"
export const MEASURES: { value: Measure; label: string }[] = [
  { value: "revenue", label: "Sales" },
  { value: "orders", label: "Orders" },
  { value: "aov", label: "Average order" },
  { value: "ipo", label: "Items per order" },
]

function seriesOf(dto: Dto, measure: Measure) {
  const b = dto.series.buckets
  const per = (a: number | string | null, n: number | null) => (a === null || !n ? null : Number(a) / n)
  switch (measure) {
    case "revenue":
      return { now: b.map((x) => Number(x.revenue)), then: b.map((x) => (x.previousRevenue === null ? null : Number(x.previousRevenue))), format: (n: number) => money(String(n), dto.currency) }
    case "orders":
      return { now: b.map((x) => x.orders), then: b.map((x) => x.previousOrders), format: (n: number) => String(Math.round(n)) }
    case "aov":
      return { now: b.map((x) => per(x.revenue, x.orders)), then: b.map((x) => per(x.previousRevenue, x.previousOrders)), format: (n: number) => money(String(n), dto.currency) }
    case "ipo":
      return { now: b.map((x) => per(x.units, x.orders)), then: b.map((x) => per(x.previousUnits, x.previousOrders)), format: (n: number) => n.toFixed(1) }
  }
}

function Series({ dto, measure }: { dto: Dto; measure: Measure }) {
  const [asTable, setAsTable] = useState(false)
  const { now, then, format } = seriesOf(dto, measure)
  const labels = bucketLabels(dto)
  const names = periodNames(dto.range)
  const label = MEASURES.find((x) => x.value === measure)!.label
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ChartLegend names={names} />
        <Button variant="ghost" size="sm" className="ml-auto" data-tour="insights.view-toggle" onClick={() => setAsTable(!asTable)}>
          {asTable ? <BarChart3 aria-hidden="true" /> : <Table2 aria-hidden="true" />}
          {asTable ? "Show chart" : "Show table"}
        </Button>
      </div>
      {asTable ? (
        <StaticTable
          label={label}
          rows={labels.map((when, i) => ({ when, now: now[i] ?? null, then: then[i] ?? null }))}
          getRowId={(r) => r.when}
          columns={[
            { id: "when", header: dto.series.grain === "hour" ? "Hour" : "Day", accessorFn: (r) => r.when },
            { id: "now", header: names[0], cell: ({ row }) => (row.original.now === null ? "-" : format(row.original.now)) },
            { id: "then", header: names[1], cell: ({ row }) => (row.original.then === null ? "-" : format(row.original.then)) },
          ]}
        />
      ) : (
        <LineChart labels={labels} current={now} previous={then} format={format} names={names} label={`${label}, ${names[0]} against ${names[1]}`} height={260} />
      )}
    </>
  )
}

const figureOf = (dto: Dto, measure: Measure) =>
  measure === "revenue"
    ? { value: money(dto.primary.revenue.value, dto.currency), figure: dto.primary.revenue, unit: "%" }
    : measure === "orders"
      ? { value: dto.primary.orders.value, figure: dto.primary.orders, unit: "" }
      : measure === "aov"
        ? { value: moneyCents(dto.primary.averageOrderValue.value, dto.currency), figure: dto.primary.averageOrderValue, unit: "%" }
        : { value: dto.primary.itemsPerOrder.value, figure: dto.primary.itemsPerOrder, unit: "%" }

const CARD_GRID = "grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-md:grid-cols-1"

// ---- Overview -------------------------------------------------------------------------------------------------------

export function OverviewPage({ dto }: { dto: Dto }) {
  const [measure, setMeasure] = useState<Measure>("revenue")
  const line = headline(dto)
  const { revenue, orders } = dto.primary
  const q = dto.quality
  const fig = "underline decoration-input decoration-2 underline-offset-[6px] hover:decoration-foreground"
  const search = searchOf(dto.range)
  const stock = dto.stock
  const cant = dto.secondary.cantSupply.units
  return (
    <>
      <div className="mb-8">
        <div className="mb-2.5 flex flex-wrap gap-2">
          {dto.briefing.mood ? (
            <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium", dto.briefing.mood === "strong" || dto.briefing.mood === "steady" ? "bg-success-soft text-success" : "bg-accent2-soft text-accent2")}>
              {dto.briefing.mood === "strong" || dto.briefing.mood === "steady" ? <ArrowUp aria-hidden="true" className="size-3.5" /> : <ArrowDown aria-hidden="true" className="size-3.5" />}
              {`${dto.briefing.mood[0]!.toUpperCase()}${dto.briefing.mood.slice(1)} ${dto.range === "today" ? "day" : dto.range === "7d" ? "week" : "month"}`}
            </span>
          ) : null}
          <span className="inline-flex h-6 items-center rounded-md border px-2 text-[12.5px] font-medium">
            {periodNames(dto.range)[0]}
            {dto.primary.revenue.change.kind !== "none" ? ` · against ${dto.briefing.comparedWith}` : ""}
          </span>
        </div>
        <m.p {...enter} role="status" data-tour="insights.figures" className="max-w-[900px] text-[26px] leading-[34px] font-semibold tracking-[-0.022em] text-pretty max-md:text-xl max-md:leading-7">
          {line.mood}
          {line.revenue === null ? null : (
            <>
              Sales are{" "}
              <PageLink page="sales" range={dto.range} className={fig}>
                <RollingNumber value={Number(revenue.value)} format={(n) => money(String(n), dto.currency)} />
              </PageLink>
              {line.change ? (
                <>
                  <span className="font-medium text-muted-foreground">, {line.change.word}</span>{" "}
                  <PageLink page="sales" range={dto.range} className={fig}>
                    {line.change.amount}
                  </PageLink>{" "}
                  <span className="font-medium text-muted-foreground">on {dto.briefing.comparedWith}, from</span>{" "}
                </>
              ) : (
                <span className="font-medium text-muted-foreground"> from </span>
              )}
              <PageLink page="sales" range={dto.range} className={fig}>
                {plural(Number(orders.value), "order")}
              </PageLink>
              .
            </>
          )}
        </m.p>
        {dto.pace ? (
          <p className="mt-2.5 text-[15px] text-muted-foreground">
            On pace for about <b className="font-semibold text-foreground">{money(dto.pace.revenue, dto.currency)}</b> and{" "}
            <b className="font-semibold text-foreground">{plural(dto.pace.orders, "order")}</b> by close, if the rest of the day goes like a usual one.
          </p>
        ) : null}
        {dto.briefing.changes.length > 0 ? (
          <ul aria-label="What changed" className={cn("mt-[18px] grid border-y max-xl:grid-cols-2 max-md:grid-cols-1", ["grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4"][Math.min(dto.briefing.changes.length, 4) - 1])}>
            {dto.briefing.changes.map((c, i) => {
              const Icon = c.tone === "up" ? ArrowUp : c.tone === "down" ? ArrowDown : ArrowRight
              return (
                <li key={c.title} className={cn("min-w-0 border-l max-xl:[&:nth-child(3)]:border-l-0 max-xl:[&:nth-child(n+3)]:border-t max-md:border-t max-md:border-l-0 max-md:first:border-t-0", i === 0 && "border-l-0")}>
                  <PageLink page={c.page} range={dto.range} className={cn("grid grid-cols-[20px_minmax(0,1fr)] gap-x-2 gap-y-px py-3 no-underline hover:bg-row-hover", i === 0 ? "pr-4" : "px-4 max-md:px-0")}>
                    <Icon aria-hidden="true" className={cn("row-span-3 mt-[3px] size-4", c.tone === "up" ? "text-success" : c.tone === "down" ? "text-destructive" : "text-muted-foreground")} />
                    <b className="font-medium">{c.title}</b>
                    <small className="text-[13px] leading-[18px] text-muted-foreground">{c.detail}</small>
                    <span className="mt-1 text-[12.5px] font-medium text-muted-foreground">See {c.page} →</span>
                  </PageLink>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>

      <div className="ef-board-layout">
        <div className="ef-board-main">
          <BoardSection
            id="in-sales-t"
            order={2}
            title={MEASURES.find((x) => x.value === measure)!.label}
            description={`${dto.series.grain === "hour" ? "Each hour today" : "Each day"}, against ${dto.briefing.comparedWith}. Your goods only, at your prices.`}
            actions={
              <Button variant="ghost" size="sm" asChild>
                <PageLink page="sales" range={dto.range}>
                  Sales
                  <ArrowRight aria-hidden="true" />
                </PageLink>
              </Button>
            }
          >
            <div role="tablist" aria-label="What to chart" className="mb-4 grid grid-cols-4 border-y max-md:grid-cols-2">
              {MEASURES.map((x, i) => {
                const f = figureOf(dto, x.value)
                return (
                  <button
                    key={x.value}
                    type="button"
                    role="tab"
                    aria-selected={measure === x.value}
                    onClick={() => setMeasure(x.value)}
                    className={cn(
                      "relative grid min-w-0 content-start gap-0.5 border-l px-3.5 py-3 text-left hover:bg-row-hover max-md:[&:nth-child(3)]:border-l-0 max-md:[&:nth-child(n+3)]:border-t",
                      i === 0 && "border-l-0",
                      measure === x.value && "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground",
                    )}
                  >
                    <span className="text-[13px] text-muted-foreground">{x.label}</span>
                    <b className="text-2xl leading-[30px] font-semibold tracking-[-0.025em] tabular-nums">{f.value}</b>
                    <Delta figure={f.figure} unit={f.unit} small />
                  </button>
                )
              })}
            </div>
            <Series dto={dto} measure={measure} />
          </BoardSection>

          <BoardSection
            id="in-health-t"
            order={3}
            title="How you’re doing"
            description={`How well orders leave your shop, ${RANGE_IN[dto.range]}. Each opens its chart.`}
            actions={
              <Button variant="ghost" size="sm" asChild>
                <PageLink page="service" range={dto.range}>
                  Service
                  <ArrowRight aria-hidden="true" />
                </PageLink>
              </Button>
            }
          >
            <div className="grid grid-cols-4 border-y max-md:grid-cols-2">
              <Health chart="found-rate" range={dto.range} label="Found rate" value={q.foundRate ? `${q.foundRate.value}%` : "-"}>
                {q.foundRate ? <Delta figure={q.foundRate} unit=" pts" small /> : null}
              </Health>
              <Health chart="time-to-ready" range={dto.range} label="Time to ready" value={q.averageTimeToReady ? minutes(q.averageTimeToReady.value) : "-"}>
                {q.averageTimeToReady ? <Delta figure={q.averageTimeToReady} goodWhenUp={false} small /> : null}
              </Health>
              <Health chart="ready-for-each-driver" range={dto.range} label="Ready before the driver" value={q.readyBeforeDriver ? `${Math.round(Number(q.readyBeforeDriver.value))}%` : "-"}>
                {q.readyBeforeDriver ? <Delta figure={q.readyBeforeDriver} unit=" pts" small /> : <span className="text-[12.5px] text-muted-foreground">No driver came yet</span>}
              </Health>
              <Health chart="cant-supply" range={dto.range} label="Couldn’t supply" value={plural(cant, "item")}>
                {q.cantSupplyRate ? <Delta figure={q.cantSupplyRate} unit=" pts" goodWhenUp={false} small /> : null}
              </Health>
            </div>
          </BoardSection>

          <BoardSection id="in-closer-t" order={4} tour="insights.cards" title="Look closer" description="Each card is one finding. Open it for the whole chart and its table.">
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <PageCard
                to="products"
                search={search}
                label="Best sellers"
                finding={dto.topProducts[0] ? `${dto.topProducts[0].name} leads with ${money(dto.topProducts[0].revenue, dto.currency)}` : "Nothing sold yet"}
                sub="Open Products"
              >
                <MiniBarsH values={dto.topProducts.map((p) => Number(p.revenue))} />
              </PageCard>
              <PageCard
                to="stock"
                search={search}
                label="Stock"
                finding={stock ? (stock.outOfStock.length ? `${plural(stock.outOfStock.length, "product")} selling but out of stock` : "Everything that sells is in stock") : "Couldn’t load stock just now"}
                sub="Open Stock"
              >
                {stock ? (
                  <span className="grid h-full grid-cols-3 content-center gap-2">
                    {[
                      [stock.outOfStock.length, "Out of stock"],
                      [stock.runningOut.length, "Run out in 3 days"],
                      [stock.notSelling ? stock.notSelling.length : "-", "Not selling"],
                    ].map(([n, l]) => (
                      <span key={l} className="grid text-xs leading-4 text-muted-foreground">
                        <b className="text-[22px] leading-7 font-semibold tracking-[-0.02em] text-foreground">{n}</b>
                        {l}
                      </span>
                    ))}
                  </span>
                ) : null}
              </PageCard>
              {CHARTS.filter((c) => c.slug === "ready-for-each-driver" || c.slug === "when-orders-come-in").map((c) => (
                <ChartCard key={c.slug} chart={{ ...c, measure: undefined }} dto={dto} search={search} />
              ))}
            </div>
          </BoardSection>
        </div>
        <div className="ef-board-rail">
          <WorthDoing dto={dto} />
        </div>
      </div>
    </>
  )
}

function Health({ chart, range, label, value, children }: { chart: string; range: InsightsRange; label: string; value: string; children: ReactNode }) {
  const c = CHARTS.find((x) => x.slug === chart)!
  return (
    <Link
      to="/insights/$section/$chart"
      params={{ section: c.page, chart: c.slug }}
      search={searchOf(range) as never}
      className="grid min-w-0 content-start gap-px border-l px-4 py-3 no-underline first:border-l-0 first:pl-0 hover:bg-row-hover max-md:[&:nth-child(3)]:border-l-0 max-md:[&:nth-child(3)]:pl-0 max-md:[&:nth-child(n+3)]:border-t"
    >
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <b className="text-xl leading-7 font-semibold tracking-[-0.02em] tabular-nums">{value}</b>
      {children}
    </Link>
  )
}

// ---- worth doing ---------------------------------------------------------------------------------------------------

const WORTH_ICON: Record<WorthRow["id"], LucideIcon> = {
  oos: PackageX,
  runningOut: Hourglass,
  missedRun: Clock,
  cantSupply: PackageX,
  busiest: Users,
  notSelling: Archive,
  writtenOff: TrendingDown,
}

/** What the figures say to do, biggest cost first. Each opens the page behind it. */
export function WorthDoing({ dto }: { dto: Dto }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ oos: true })
  const rows = worthDoing(dto)
  const search = searchOf(dto.range)
  return (
    <BoardSection id="in-worth-t" order={1} tour="insights.worth" title="Worth doing" description="What these figures say to do, biggest cost first. Each opens the page behind it.">
      {(["sales", "week", "later"] as const).map((tier) => {
        const mine = rows.filter((r) => r.tier === tier)
        const live = mine.filter((r) => r.failed || r.n === null || r.n > 0)
        const clear = mine.filter((r) => !r.failed && r.n === 0)
        return (
          <div key={tier}>
            <h3 className="border-t pt-3 pb-1.5 text-[12.5px] font-medium text-muted-foreground">{WORTH_TIER_WORDS[tier]}</h3>
            {live.map((r) => {
              const Icon = WORTH_ICON[r.id]
              const foldable = !r.failed && r.items.length > 0
              return (
                <div key={r.id}>
                  <Link
                    to={r.to as never}
                    search={search as never}
                    className="-mx-2 grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-md p-2 no-underline hover:bg-row-hover"
                  >
                    <span className={cn("grid size-8 place-items-center rounded-lg bg-muted [&_svg]:size-4", tier === "sales" && "bg-primary-muted text-primary", r.id === "missedRun" && "bg-destructive-soft text-destructive")}>
                      <Icon aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{r.title}</span>
                      <span className="mt-px block text-[13px] leading-[18px] text-muted-foreground">{r.failed ? "Couldn’t load stock just now" : r.desc}</span>
                    </span>
                    <span className="min-w-[26px] text-right text-xl leading-7 font-semibold tracking-[-0.02em] tabular-nums">{r.failed ? <small className="text-[13px] font-medium text-muted-foreground">-</small> : r.n}</span>
                  </Link>
                  {foldable ? (
                    <>
                      <div className="-mt-2 mb-1.5 ml-[42px] flex min-h-[26px] items-center">
                        <button
                          type="button"
                          aria-expanded={open[r.id] === true}
                          onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}
                          className="ml-auto inline-flex h-[26px] items-center gap-1 rounded-sm px-1.5 text-[12.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          {open[r.id] ? "Hide" : r.items.length === 1 ? "Show it" : `Show these ${r.items.length}`}
                          <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform", open[r.id] && "rotate-180")} />
                        </button>
                      </div>
                      {open[r.id] ? (
                        <ul className="mb-2 ml-[42px] border-l">
                          {r.items.map((it, i) => (
                            <li key={it.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 py-1 pl-2.5">
                              <span className="grid min-w-0 text-[13px] leading-[18px]">
                                <b className="truncate font-medium">{it.primary}</b>
                                <small className="truncate text-[12.5px] text-muted-foreground">{it.secondary}</small>
                              </span>
                              <Button variant={i === 0 ? "default" : "outline"} size="sm" asChild>
                                <Link to={it.to as never}>{it.action}</Link>
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : null}
                </div>
              )
            })}
            {clear.length ? (
              <p className="flex items-start gap-2 pt-1 pb-2.5 text-[13px] leading-[18px] text-muted-foreground">
                <Check aria-hidden="true" className="mt-0.5 size-3.5 flex-none text-success" />
                <span>{clear.map((c) => c.title).join(" · ")}: nothing to do</span>
              </p>
            ) : null}
          </div>
        )
      })}
    </BoardSection>
  )
}

// ---- Sales ----------------------------------------------------------------------------------------------------------

export function SalesPage({ dto }: { dto: Dto }) {
  const [measure, setMeasure] = useState<Measure>("revenue")
  const f = figureOf(dto, measure)
  const name = MEASURES.find((x) => x.value === measure)!.label
  const { refunds, cantSupply, cancelled } = dto.secondary
  const search = searchOf(dto.range)
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="text-muted-foreground">
            {name}, {periodNames(dto.range)[0].toLowerCase()}
          </p>
          <p className="text-[56px] leading-none font-semibold tracking-[-0.04em] tabular-nums max-md:text-[44px]">{f.value}</p>
        </div>
        <p className="pb-1.5">
          <Delta figure={f.figure} unit={f.unit} label={`on ${dto.briefing.comparedWith}`} />
        </p>
        <ToggleGroup type="single" variant="outline" aria-label="What to chart" data-tour="insights.measure" className="ml-auto max-md:ml-0" value={measure} onValueChange={(v) => v && setMeasure(v as Measure)}>
          {MEASURES.map((x) => (
            <ToggleGroupItem key={x.value} value={x.value} className="flex-none px-3 whitespace-nowrap">
              {x.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <section aria-label={`${name} over time`}>
        <Series dto={dto} measure={measure} />
      </section>

      <BoardSection id="in-sales-closer-t" tour="insights.rhythm" className="mt-10" title="Look closer" description="Each card is one finding. Open it for the whole chart and its table.">
        <div className={cn(CARD_GRID, "[&>:first-child]:col-span-2 max-md:[&>:first-child]:col-span-1")}>
          {CHARTS.filter((c) => c.page === "sales").map((c) => (
            <ChartCard key={c.slug} chart={c} dto={dto} search={search} />
          ))}
        </div>
      </BoardSection>

      <BoardSection
        id="in-behind-t"
        tour="insights.behind"
        className="mt-10"
        title="Behind the sales"
        description="Sales count your goods only, at your prices. A refund comes off on the day it was issued, so past days stay as you saw them."
      >
        <div className="grid grid-cols-3 border-y max-md:grid-cols-1">
          <Behind to="/orders?payment=refunded" metric="Refunds" label="Refunds" value={moneyCents(refunds.value, dto.currency)} note={plural(refunds.orders, "order")} />
          <Behind to="/orders?tab=unfulfillable" metric="Can't supply" label="Couldn’t supply" value={plural(cantSupply.units, "item")} note={plural(Number(cantSupply.value), "order")} />
          <Behind to="/orders?tab=withdrawn" metric="Cancelled" label="Cancelled" value={plural(Number(cancelled.value), "order")} note="Withdrawn before you packed them" />
        </div>
      </BoardSection>
    </>
  )
}

function Behind({ to, metric, label, value, note }: { to: string; metric: string; label: string; value: string; note: string }) {
  return (
    <Link
      to={to as never}
      onClick={() => track({ name: "insights_drilled", metric })}
      className="grid min-w-0 content-start gap-px border-l px-4 py-3 no-underline first:border-l-0 first:pl-0 hover:bg-row-hover max-md:border-t max-md:border-l-0 max-md:px-0 max-md:first:border-t-0"
    >
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <b className="text-xl leading-7 font-semibold tracking-[-0.02em] tabular-nums">{value}</b>
      <span className="text-[12.5px] text-muted-foreground">{note}</span>
    </Link>
  )
}

// ---- Products -------------------------------------------------------------------------------------------------------

export function ProductsPage({ dto }: { dto: Dto }) {
  const { up, down } = movers(dto.topProducts)
  if (dto.topProducts.length === 0) return <p className="py-10 text-center text-muted-foreground">Nothing sold in this window yet.</p>
  const top = dto.topProducts[0]!
  const empty = (t: string) => (
    <p className="flex items-start gap-2 border-t py-2.5 text-sm text-muted-foreground">
      <Check aria-hidden="true" className="mt-0.5 size-3.5 text-success" />
      {t}
    </p>
  )
  const compare = dto.primary.revenue.change.kind !== "none"
  return (
    <>
      <p className="mb-6 text-[17px] leading-[25px] font-semibold text-pretty">
        {dto.concentration.top80 > 0 ? `${dto.concentration.top80} of your ${dto.concentration.products} products bring 80% of your sales. ` : ""}
        {top.name} leads, with {top.shareOfSales}%.
      </p>
      <div className="ef-board-layout">
        <div className="ef-board-main">
          <BoardSection id="in-best-t" tour="insights.best" order={1} title={`Best sellers, ${periodNames(dto.range)[0].toLowerCase()}`}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-[12.5px] text-muted-foreground">
                  <th className="w-7 pb-1.5 text-left font-medium">
                    <span className="sr-only">Rank</span>
                  </th>
                  <th className="pb-1.5 text-left font-medium">Product</th>
                  <th className="pb-1.5 pl-3 text-right font-medium max-md:hidden">Units</th>
                  <th className="pb-1.5 pl-3 text-right font-medium">Sales</th>
                  <th className="pb-1.5 pl-3 text-right font-medium max-md:hidden">Share</th>
                  <th className="pb-1.5 pl-3 text-right font-medium max-md:hidden">Place</th>
                  <th className="pb-1.5 pl-3 text-right font-medium">Stock</th>
                </tr>
              </thead>
              <tbody>
                {dto.topProducts.map((p, i) => (
                  <tr key={p.productId} className="border-b">
                    <td className="py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="py-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {p.thumbnailUrl ? (
                          <img src={p.thumbnailUrl} alt="" className="size-9 flex-none rounded-md border object-cover" />
                        ) : (
                          <span aria-hidden="true" className="grid size-9 flex-none place-items-center rounded-md bg-muted font-semibold text-muted-foreground">
                            {p.name.slice(0, 1)}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <Link to="/catalog/$productId" params={{ productId: p.productId }} className="block truncate font-medium no-underline hover:underline">
                            {p.name}
                          </Link>
                          <m.i
                            aria-hidden="true"
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.5, delay: 0.1 + i * 0.03, ease: [0.2, 0.8, 0.2, 1] }}
                            className="mt-1 block h-[5px] origin-left rounded-r bg-primary-fill"
                            style={{ width: `${p.share * 100}%` }}
                          />
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums max-md:hidden">{p.units}</td>
                    <td className="py-2 pl-3 text-right font-semibold tabular-nums">{money(p.revenue, dto.currency)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums max-md:hidden">{p.shareOfSales}%</td>
                    <td className="py-2 pl-3 text-right whitespace-nowrap max-md:hidden">
                      {p.previousRank === null ? <span className="text-muted-foreground">{compare ? "New" : "-"}</span> : <Places places={p.previousRank - (i + 1)} short />}
                    </td>
                    <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums">
                      {p.stockLeft === null ? <span className="text-muted-foreground">-</span> : p.stockLeft === 0 ? <span className="font-medium text-destructive">Out of stock</span> : `${p.stockLeft} left`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12.5px] text-muted-foreground">Place is against {dto.briefing.comparedWith}. Stock is what you have now.</p>
          </BoardSection>
        </div>
        <div className="ef-board-rail">
          <BoardSection id="in-up-t" tour="insights.up" order={2} title="Moving up">
            {!compare ? empty("Appears once there is a period to compare.") : up.length ? (
              <List rows={up.map((x) => ({ key: x.product.productId, title: x.product.name, note: `Now number ${x.rank}`, right: <Places places={x.places} /> }))} />
            ) : (
              empty("Nothing has climbed this period.")
            )}
          </BoardSection>
          <BoardSection id="in-slip-t" tour="insights.slipping" order={3} title="Slipping">
            {!compare ? empty("Appears once there is a period to compare.") : down.length ? (
              <List rows={down.map((x) => ({ key: x.product.productId, title: x.product.name, note: `Now number ${x.rank}`, right: <Places places={x.places} /> }))} />
            ) : (
              empty("Nothing has slipped this period.")
            )}
          </BoardSection>
          <BoardSection id="in-oos-t" tour="insights.oos" order={4} title="Selling but out of stock">
            {!dto.stock ? (
              <CouldNotLoad what="stock" />
            ) : dto.stock.outOfStock.length ? (
              <List
                rows={dto.stock.outOfStock.map((o) => ({
                  key: o.variantId,
                  title: o.name,
                  note: `Sold ${o.sold} ${RANGE_IN[dto.range]}`,
                  right: (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/catalog/${o.productId}?size=${o.variantId}` as never}>Restock</Link>
                    </Button>
                  ),
                }))}
              />
            ) : (
              empty("Everything that is selling is in stock.")
            )}
          </BoardSection>
          <BoardSection id="in-pairs-t" order={5} title="Often bought together" description="Your products that share an order most. Worth keeping near each other.">
            {dto.together.length ? (
              <List rows={dto.together.map((t) => ({ key: `${t.a.productId}-${t.b.productId}`, title: t.a.name, note: `with ${t.b.name}`, right: <span className="font-medium tabular-nums">{plural(t.orders, "order")}</span> }))} />
            ) : (
              <p className="border-t py-2.5 text-sm text-muted-foreground">Appears once two orders share the same products.</p>
            )}
          </BoardSection>
        </div>
      </div>
    </>
  )
}

function List({ rows }: { rows: { key: string; title: string; note: string; right: ReactNode }[] }) {
  return (
    <ul className="border-t">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b py-2.5">
          <span className="min-w-0">
            <b className="block truncate font-medium">{r.title}</b>
            <small className="block truncate text-[12.5px] text-muted-foreground">{r.note}</small>
          </span>
          {r.right}
        </li>
      ))}
    </ul>
  )
}

function Places({ places, short = false }: { places: number; short?: boolean }) {
  if (places === 0) return <span className="text-muted-foreground">-</span>
  const Icon = places > 0 ? ArrowUp : ArrowDown
  const n = Math.abs(places)
  return (
    <span className={cn("inline-flex items-center gap-1 text-[13px]", places > 0 ? "text-success" : "text-destructive")}>
      <Icon aria-hidden="true" className="size-3.5" />
      <span className="sr-only">{places > 0 ? "Up " : "Down "}</span>
      {short ? n : plural(n, "place")}
    </span>
  )
}

// ---- Stock (new) ----------------------------------------------------------------------------------------------------

export function StockPage({ dto }: { dto: Dto }) {
  const s = dto.stock
  if (!s) {
    return (
      <BoardSection id="in-stock-t" title="Running out">
        <CouldNotLoad what="stock" />
      </BoardSection>
    )
  }
  const missed = s.soldOut.reduce((n, x) => n + Number(x.missedRevenue), 0)
  const days = (d: number) => (d < 1 ? "Today" : d < 1.5 ? "About 1 day" : `About ${Math.round(d)} days`)
  const thumb = (name: string) => (
    <span aria-hidden="true" className="grid size-9 flex-none place-items-center rounded-md bg-muted font-semibold text-muted-foreground">
      {name.slice(0, 1)}
    </span>
  )
  return (
    <>
      <p className="mb-6 text-[17px] leading-[25px] font-semibold text-pretty">
        {s.outOfStock.length
          ? `${plural(s.outOfStock.length, "product")} ${s.outOfStock.length === 1 ? "is" : "are"} selling but out of stock${s.runningOut.length ? `, and ${s.runningOut.length} more ${s.runningOut.length === 1 ? "runs" : "run"} out within 3 days at this pace` : ""}.`
          : s.runningOut.length
            ? `Everything that sells is in stock; ${plural(s.runningOut.length, "product")} run${s.runningOut.length === 1 ? "s" : ""} out within 3 days at this pace.`
            : "Everything that sells is in stock, and nothing runs out in the next 3 days."}
        {missed > 0 ? ` Selling out ${RANGE_IN[dto.range]} cost about ${money(String(missed), dto.currency)}.` : ""}
      </p>
      <div className="ef-board-layout">
        <div className="ef-board-main">
          <BoardSection
            id="in-run-t"
            tour="insights.running-out"
            order={1}
            title="Running out"
            description="When each product runs out if it keeps selling like the last 4 weeks."
            actions={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/catalog/availability" search={{ filter: "low_stock" } as never}>
                  Availability
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            }
          >
            {s.runningOut.length === 0 ? (
              <p className="border-t py-3 text-sm text-muted-foreground">Nothing runs out in the next 3 days.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-[12.5px] text-muted-foreground">
                    <th className="pb-1.5 text-left font-medium">Product</th>
                    <th className="pb-1.5 pl-3 text-right font-medium">Left</th>
                    <th className="pb-1.5 pl-3 text-right font-medium max-md:hidden">Sells a day</th>
                    <th className="pb-1.5 pl-3 text-right font-medium">Runs out</th>
                    <th className="pb-1.5">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {s.runningOut.map((r) => (
                    <tr key={r.productId} className="border-b">
                      <td className="py-2">
                        <span className="flex items-center gap-2.5">
                          {thumb(r.name)}
                          <Link to="/catalog/$productId" params={{ productId: r.productId }} className="font-medium no-underline hover:underline">
                            {r.name}
                          </Link>
                        </span>
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums">{r.left}</td>
                      <td className="py-2 pl-3 text-right tabular-nums max-md:hidden">{r.perDay}</td>
                      <td className={cn("py-2 pl-3 text-right whitespace-nowrap", Number(r.daysLeft) < 1.5 && "font-medium text-accent2")}>{days(Number(r.daysLeft))}</td>
                      <td className="py-2 pl-3 text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/catalog/$productId" params={{ productId: r.productId }}>
                            Restock
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </BoardSection>

          <BoardSection
            id="in-soldout-t"
            tour="insights.sold-out"
            order={2}
            title={`Sold out ${RANGE_IN[dto.range]}`}
            description="Missed sales are a guess: the hours it was out, times what it sells in an average hour."
          >
            {s.soldOut.length === 0 ? (
              <p className="flex items-start gap-2 border-t py-3 text-sm text-muted-foreground">
                <Check aria-hidden="true" className="mt-0.5 size-3.5 text-success" />
                Nothing sold out {RANGE_IN[dto.range]}.
              </p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-[12.5px] text-muted-foreground">
                    <th className="pb-1.5 text-left font-medium">Product</th>
                    <th className="pb-1.5 pl-3 text-right font-medium max-md:hidden">Times</th>
                    <th className="pb-1.5 pl-3 text-right font-medium">Hours out</th>
                    <th className="pb-1.5 pl-3 text-right font-medium">Missed sales</th>
                  </tr>
                </thead>
                <tbody>
                  {s.soldOut.map((x) => (
                    <tr key={x.variantId} className="border-b">
                      <td className="py-2">
                        <span className="flex items-center gap-2.5">
                          {thumb(x.name)}
                          <span>
                            <Link to="/catalog/$productId" params={{ productId: x.productId }} className="font-medium no-underline hover:underline">
                              {x.name}
                            </Link>
                            {x.stillOut ? <small className="block text-[12.5px] font-medium text-destructive">Still out</small> : null}
                          </span>
                        </span>
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums max-md:hidden">{x.times}</td>
                      <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums">{Number(x.hours) < 1 ? `${Math.round(Number(x.hours) * 60)} min` : `${Math.round(Number(x.hours))} h`}</td>
                      <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums">About {money(x.missedRevenue, dto.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </BoardSection>
        </div>
        <div className="ef-board-rail">
          <BoardSection id="in-idle-t" tour="insights.not-selling" order={3} title="Not sold in 30 days" description="In stock and on sale, but nobody bought one.">
            {s.notSelling === null ? (
              <p className="border-t py-2.5 text-sm text-muted-foreground">Appears after 30 days of sales.</p>
            ) : s.notSelling.length === 0 ? (
              <p className="flex items-start gap-2 border-t py-2.5 text-sm text-muted-foreground">
                <Check aria-hidden="true" className="mt-0.5 size-3.5 text-success" />
                Everything in stock has sold in the last 30 days.
              </p>
            ) : (
              <ul className="border-t">
                {s.notSelling.map((p) => (
                  <li key={p.productId}>
                    <Link to="/catalog/$productId" params={{ productId: p.productId }} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b py-2.5 no-underline hover:bg-row-hover">
                      <span className="min-w-0">
                        <b className="block truncate font-medium">{p.name}</b>
                        <small className="block text-[12.5px] text-muted-foreground">{p.left} in stock</small>
                      </span>
                      <span className="text-right font-medium tabular-nums">
                        {money(p.value, dto.currency)}
                        <small className="block text-[12.5px] font-normal text-muted-foreground">at your price</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </BoardSection>
          <BoardSection id="in-wo-t" tour="insights.written-off" order={4} title={`Written off ${RANGE_IN[dto.range]}`}>
            <ul className="border-t text-sm">
              {[
                ["Expired", plural(s.writtenOff.expired.units, "unit"), money(s.writtenOff.expired.value, dto.currency)],
                ["Damaged", plural(s.writtenOff.damaged.units, "unit"), money(s.writtenOff.damaged.value, dto.currency)],
                ["Count corrections", "Stock found to be different on a count", s.writtenOff.corrections.units ? `${s.writtenOff.corrections.units > 0 ? "+" : ""}${s.writtenOff.corrections.units} units` : "None"],
              ].map(([label, note, value]) => (
                <li key={label} className="flex items-baseline justify-between gap-3 border-b py-2.5">
                  <span>
                    {label}
                    <small className="block text-[12.5px] text-muted-foreground">{note}</small>
                  </span>
                  <b className="font-medium whitespace-nowrap tabular-nums">{value}</b>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12.5px] text-muted-foreground">At your prices. Only what you recorded as a stock change.</p>
          </BoardSection>
        </div>
      </div>
    </>
  )
}

// ---- Service --------------------------------------------------------------------------------------------------------

export function ServicePage({ dto }: { dto: Dto }) {
  const search = searchOf(dto.range)
  const measures = ["found-rate", "cant-supply", "time-to-ready", "ready-for-each-driver"]
  return (
    <>
      <BoardSection id="in-measures-t" tour="insights.found" title="Your four measures" description={`${periodNames(dto.range)[0]}, against ${dto.briefing.comparedWith}. Open one for its chart.`}>
        <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-md:grid-cols-1">
          {measures.map((slug) => {
            const c = CHARTS.find((x) => x.slug === slug)!
            // As a measure, the run chart is the rate it adds up to.
            return <ChartCard key={slug} chart={slug === "ready-for-each-driver" ? { ...c, label: "Ready before the driver" } : c} dto={dto} search={search} />
          })}
        </div>
      </BoardSection>

      <BoardSection id="in-service-closer-t" tour="insights.ready" className="mt-10" title="Look closer" description="Each card is one finding. Open it for the whole chart and its table.">
        <div className={CARD_GRID}>
          {CHARTS.filter((c) => c.page === "service" && !measures.includes(c.slug)).map((c) => (
            <ChartCard key={c.slug} chart={c} dto={dto} search={search} />
          ))}
          <ChartCard chart={{ ...CHARTS.find((c) => c.slug === "ready-for-each-driver")!, measure: undefined }} dto={dto} search={search} />
        </div>
      </BoardSection>

      <BoardSection id="in-cant-t" tour="insights.missed" className="mt-10 max-w-[820px]" title="What you couldn’t supply" description="Most first. Each opens the product.">
        {dto.cantSupplyProducts.length ? (
          <ul className="border-t">
            {dto.cantSupplyProducts.map((p) => (
              <li key={p.productId}>
                <Link to="/catalog/$productId" params={{ productId: p.productId }} className="flex justify-between gap-3 border-b py-2.5 no-underline hover:bg-row-hover">
                  <b className="font-medium">{p.name}</b>
                  <span className="tabular-nums">{plural(p.units, "unit")}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-start gap-2 border-t py-2.5 text-sm text-muted-foreground">
            <Check aria-hidden="true" className="mt-0.5 size-3.5 text-success" />
            You supplied everything this period.
          </p>
        )}
      </BoardSection>

      {/* The server sends who picked to managers only: staff get null and no section. */}
      {dto.pickers ? (
        <BoardSection
          id="in-pickers-t"
          tour="insights.pickers"
          className="mt-10 max-w-[820px]"
          title={
            <span className="inline-flex items-center gap-2">
              Who picked
              <span className="inline-flex h-[22px] items-center gap-1 rounded-md border px-1.5 text-xs font-medium text-muted-foreground">
                <Lock aria-hidden="true" className="size-3" />
                Managers only
              </span>
            </span>
          }
          description={`Orders each person finished ${RANGE_IN[dto.range]}. For planning shifts, not for ranking people.`}
        >
          {dto.pickers.length === 0 ? (
            <p className="border-t py-2.5 text-sm text-muted-foreground">Nobody started an order on the console {RANGE_IN[dto.range]}.</p>
          ) : (
            <StaticTable
              label="Who picked"
              rows={dto.pickers}
              getRowId={(p) => p.staffId}
              columns={[
                { id: "name", header: "Name", accessorFn: (p) => p.name },
                { id: "orders", header: "Orders", accessorFn: (p) => p.orders },
                { id: "ready", header: "Time to ready", cell: ({ row }) => (row.original.averageTimeToReady === null ? "-" : minutes(String(row.original.averageTimeToReady))) },
                { id: "cant", header: "Couldn’t find", cell: ({ row }) => plural(row.original.cantSupplyUnits, "item") },
              ]}
            />
          )}
        </BoardSection>
      ) : null}
    </>
  )
}
