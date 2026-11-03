import { useState, type ReactNode } from "react"

import { Link } from "@tanstack/react-router"
import { m } from "motion/react"
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, Minus, Table2 } from "lucide-react"

import { READY_SPREAD_LABELS, type InsightsFigureDTO, type InsightsPage, type InsightsRange, type ShopInsightsDTO, type ShopTodayDTO } from "@effy/shared-types"
import { cn } from "@effy/design-system"
import { Button, ToggleGroup, ToggleGroupItem } from "@effy/design-system/ui"
import { StaticTable } from "@effy/web-kit/data-table"

import { RollingNumber } from "@/components/console/RollingNumber"
import { track } from "@/lib/telemetry"

import { ChartLegend, LineChart } from "./LineChart"
import { bucketLabels, changeOf, headline, minutes, money, moneyCents, movers, PAGE_PATH, periodNames, spreadSentence } from "./model"
import { Rhythm } from "./Rhythm"

type Dto = ShopInsightsDTO
const enter = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] } } as const

function Delta({ figure, unit = "%", goodWhenUp = true, label }: { figure: InsightsFigureDTO; unit?: string; goodWhenUp?: boolean; label?: string }) {
  const change = changeOf(figure, unit, goodWhenUp)
  if (!change) return <span className="text-sm text-muted-foreground">Nothing to compare yet</span>
  const Icon = change.direction === "up" ? ArrowUp : change.direction === "down" ? ArrowDown : Minus
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm tabular-nums", change.tone === "good" ? "text-success" : change.tone === "bad" ? "text-destructive" : "text-muted-foreground")}>
      <Icon aria-hidden="true" className="size-3.5" />
      <span className="sr-only">{change.direction === "up" ? "Up " : change.direction === "down" ? "Down " : "No change "}</span>
      {change.text}
      {label ? <span className="ml-1 text-muted-foreground">{label}</span> : null}
    </span>
  )
}

function PageLink({ page, range, children, className }: { page: InsightsPage; range: InsightsRange; children: ReactNode; className?: string }) {
  return (
    <Link to={PAGE_PATH[page]} search={range === "7d" ? {} : { range }} className={className}>
      {children}
    </Link>
  )
}

/** A chart that can also be read as a table: the values no hover can reach. */
function Series({ dto, current, previous, format, label }: { dto: Dto; current: (number | null)[]; previous: (number | null)[]; format: (n: number) => string; label: string }) {
  const [asTable, setAsTable] = useState(false)
  const labels = bucketLabels(dto)
  const names = periodNames(dto.range)
  const rows = labels.map((when, i) => ({ when, now: current[i] ?? null, then: previous[i] ?? null }))
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-[15px] font-semibold">{label}</h2>
        <ChartLegend names={names} />
        <Button variant="ghost" size="sm" className="ml-auto" data-tour="insights.view-toggle" onClick={() => setAsTable(!asTable)}>
          {asTable ? <BarChart3 aria-hidden="true" /> : <Table2 aria-hidden="true" />}
          {asTable ? "Show chart" : "Show table"}
        </Button>
      </div>
      {asTable ? (
        <StaticTable
          label={label}
          rows={rows}
          getRowId={(r) => r.when}
          columns={[
            { id: "when", header: "When", accessorFn: (r) => r.when },
            { id: "now", header: names[0], cell: ({ row }) => (row.original.now === null ? "-" : format(row.original.now)) },
            { id: "then", header: names[1], cell: ({ row }) => (row.original.then === null ? "-" : format(row.original.then)) },
          ]}
        />
      ) : (
        <LineChart labels={labels} current={current} previous={previous} format={format} names={names} label={`${label}, ${names[0]} against ${names[1]}`} />
      )}
    </>
  )
}

const num = (s: string | null) => (s === null ? null : Number(s))

export function OverviewPage({ dto }: { dto: Dto }) {
  const line = headline(dto)
  const { revenue, orders, averageOrderValue } = dto.primary
  const { foundRate, averageTimeToReady } = dto.quality
  const Fig = ({ label, value, page, children }: { label: string; value: string; page: InsightsPage; children: ReactNode }) => (
    <PageLink page={page} range={dto.range} className="grid gap-0.5 border-l px-4 py-3.5 text-inherit no-underline first:border-l-0 first:pl-0 hover:bg-row-hover max-lg:nth-[4]:border-l-0 max-lg:nth-[4]:pl-0 max-lg:nth-[n+4]:border-t max-md:px-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <b className="text-2xl font-semibold tracking-[-.02em]">{value}</b>
      {children}
    </PageLink>
  )
  const figure = "underline decoration-input decoration-2 underline-offset-[6px] hover:decoration-foreground"
  return (
    <>
      <m.h2 {...enter} data-tour="insights.figures" className="max-w-[900px] text-[40px] leading-[50px] font-semibold tracking-[-.03em] text-balance max-lg:text-[32px] max-lg:leading-10 max-md:text-[26px] max-md:leading-[34px]">
        {line.mood}
        {line.revenue === null ? null : (
          <>
            Revenue is{" "}
            <PageLink page="sales" range={dto.range} className={cn(figure, "text-foreground")}>
              <RollingNumber value={Number(revenue.value)} format={(n) => money(String(n), dto.currency)} />
            </PageLink>
            {line.change ? (
              <>
                , <span className="text-muted-foreground">{line.change.word}</span>{" "}
                <PageLink page="sales" range={dto.range} className={cn(figure, "text-foreground")}>
                  {line.change.amount}
                </PageLink>{" "}
                <span className="text-muted-foreground">on {dto.briefing.comparedWith}, from</span>{" "}
              </>
            ) : (
              <span className="text-muted-foreground"> from </span>
            )}
            <PageLink page="sales" range={dto.range} className={cn(figure, "text-foreground")}>
              {orders.value} {orders.value === "1" ? "order" : "orders"}
            </PageLink>
            .
          </>
        )}
      </m.h2>

      {dto.briefing.changes.length > 0 ? (
        <ul className="mt-7 mb-9 grid grid-cols-3 gap-8 max-lg:gap-5 max-md:grid-cols-1 max-md:gap-4">
          {dto.briefing.changes.map((c) => {
            const Icon = c.tone === "up" ? ArrowUp : c.tone === "down" ? ArrowDown : Minus
            return (
              <m.li key={c.title} {...enter} className="grid grid-cols-[20px_minmax(0,1fr)] content-start gap-x-2.5 gap-y-0.5">
                <Icon aria-hidden="true" className={cn("row-span-2 mt-1 size-4", c.tone === "up" ? "text-success" : c.tone === "down" ? "text-destructive" : "text-muted-foreground")} />
                <b className="font-semibold">{c.title}</b>
                <span className="text-sm leading-5 text-muted-foreground">{c.detail}</span>
                <PageLink page={c.page} range={dto.range} className="col-start-2 text-sm font-medium text-muted-foreground no-underline hover:text-foreground">
                  See {c.page} →
                </PageLink>
              </m.li>
            )
          })}
        </ul>
      ) : (
        <div className="h-7" />
      )}

      <Series
        dto={dto}
        label="Revenue"
        current={dto.series.buckets.map((b) => Number(b.revenue))}
        previous={dto.series.buckets.map((b) => num(b.previousRevenue))}
        format={(n) => money(String(n), dto.currency)}
      />

      <div className="mt-8 grid grid-cols-5 border-y max-lg:grid-cols-3 max-md:grid-cols-2">
        <Fig label="Revenue" value={money(revenue.value, dto.currency)} page="sales">
          <Delta figure={revenue} />
        </Fig>
        <Fig label="Orders" value={orders.value} page="sales">
          <Delta figure={orders} unit="" />
        </Fig>
        <Fig label="Average order" value={moneyCents(averageOrderValue.value, dto.currency)} page="sales">
          <Delta figure={averageOrderValue} />
        </Fig>
        <Fig label="Found rate" value={foundRate ? `${foundRate.value}%` : "-"} page="service">
          {foundRate ? <Delta figure={foundRate} unit=" pts" /> : null}
        </Fig>
        <Fig label="Time to ready" value={averageTimeToReady ? minutes(averageTimeToReady.value) : "-"} page="service">
          {averageTimeToReady ? <Delta figure={averageTimeToReady} goodWhenUp={false} /> : null}
        </Fig>
      </div>
    </>
  )
}

type Measure = "revenue" | "orders" | "aov"
const MEASURES: { value: Measure; label: string }[] = [
  { value: "revenue", label: "Revenue" },
  { value: "orders", label: "Orders" },
  { value: "aov", label: "Average order" },
]

export function SalesPage({ dto }: { dto: Dto }) {
  const [measure, setMeasure] = useState<Measure>("revenue")
  const { revenue, orders, averageOrderValue } = dto.primary
  const buckets = dto.series.buckets
  const avg = (rev: string | null, n: number | null) => (rev === null || !n ? null : Number(rev) / n)
  const view = {
    revenue: {
      figure: revenue, value: money(revenue.value, dto.currency), unit: "%",
      now: buckets.map((b) => Number(b.revenue)), then: buckets.map((b) => num(b.previousRevenue)),
      format: (n: number) => money(String(n), dto.currency),
    },
    orders: {
      figure: orders, value: orders.value, unit: "",
      now: buckets.map((b) => b.orders), then: buckets.map((b) => b.previousOrders),
      format: (n: number) => String(Math.round(n)),
    },
    aov: {
      figure: averageOrderValue, value: moneyCents(averageOrderValue.value, dto.currency), unit: "%",
      now: buckets.map((b) => avg(b.revenue, b.orders)), then: buckets.map((b) => avg(b.previousRevenue, b.previousOrders)),
      format: (n: number) => money(String(n), dto.currency),
    },
  }[measure]
  const name = MEASURES.find((x) => x.value === measure)!.label
  const { refunds, cantSupply, cancelled } = dto.secondary
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="text-muted-foreground">{name}, {periodNames(dto.range)[0].toLowerCase()}</p>
          <p className="text-[64px] leading-none font-semibold tracking-[-.04em] max-md:text-5xl">{view.value}</p>
        </div>
        <p className="pb-1.5">
          <Delta figure={view.figure} unit={view.unit} label={`on ${dto.briefing.comparedWith}`} />
        </p>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label="Measure"
          data-tour="insights.measure"
          className="ml-auto"
          value={measure}
          onValueChange={(v) => v && setMeasure(v as Measure)}
        >
          {MEASURES.map((x) => (
            <ToggleGroupItem key={x.value} value={x.value} className="flex-none px-3 whitespace-nowrap">
              {x.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <Series dto={dto} label={name} current={view.now} previous={view.then} format={view.format} />

      <div className="mt-9 grid grid-cols-2 gap-10 max-lg:gap-6 max-md:grid-cols-1">
        <section aria-label="When your orders come in" data-tour="insights.rhythm">
          <h2 className="mb-2 text-[15px] font-semibold">When your orders come in</h2>
          <Rhythm rhythm={dto.rhythm} />
        </section>
        <section aria-label="Behind the revenue" data-tour="insights.behind">
          <h2 className="mb-1 text-[15px] font-semibold">Behind the revenue</h2>
          <Behind label="Refunds" note={`${refunds.orders} ${refunds.orders === 1 ? "order" : "orders"}`} value={moneyCents(refunds.value, dto.currency)} search={{ view: "table", payment: "refunded" }} />
          <Behind label="Can't supply" note={`${cantSupply.units} ${cantSupply.units === 1 ? "unit" : "units"}`} value={cantSupply.value} search={{ view: "table", tab: "unfulfillable" }} />
          <Behind label="Cancelled" note="Withdrawn portions" value={cancelled.value} search={{ view: "table", tab: "withdrawn" }} />
          <p className="mt-2.5 text-sm text-muted-foreground">Revenue counts your goods only. A refund comes off on the day it was issued, so past days stay as you saw them.</p>
        </section>
      </div>
    </>
  )
}

function Behind({ label, note, value, search }: { label: string; note: string; value: string; search: Record<string, string> }) {
  return (
    <Link
      to="/orders"
      search={search}
      onClick={() => track({ name: "insights_drilled", metric: label })}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b py-2.5 text-inherit no-underline last-of-type:border-b-0 hover:bg-row-hover"
    >
      <span>
        {label}
        <small className="block text-sm text-muted-foreground">{note}</small>
      </span>
      <b className="font-semibold tabular-nums">{value}</b>
    </Link>
  )
}

export function ProductsPage({ dto, today }: { dto: Dto; today: ShopTodayDTO | undefined }) {
  const { up, down } = movers(dto.topProducts)
  const out = (today?.attention ?? []).flatMap((a) => (a.kind === "out_of_stock" && a.soldLast7Days > 0 ? [a] : []))
  if (dto.topProducts.length === 0) return <p className="py-10 text-center text-muted-foreground">Nothing sold in this window yet.</p>
  return (
    <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-10 max-lg:gap-6 max-md:grid-cols-1">
      <section aria-label="Best sellers" data-tour="insights.best">
        <h2 className="mb-2 text-[15px] font-semibold">Best sellers, {periodNames(dto.range)[0].toLowerCase()}</h2>
        <div className="grid grid-cols-[24px_40px_minmax(0,1fr)_64px_96px] gap-3 border-b pb-1.5 text-xs text-muted-foreground max-md:grid-cols-[20px_36px_minmax(0,1fr)_84px] max-md:gap-2">
          <span />
          <span />
          <span>Product</span>
          <span className="text-right max-md:hidden">Units</span>
          <span className="text-right">Revenue</span>
        </div>
        <ol>
          {dto.topProducts.map((p, i) => (
            <li key={p.productId} className="grid min-h-15 grid-cols-[24px_40px_minmax(0,1fr)_64px_96px] items-center gap-3 border-b last:border-b-0 max-md:grid-cols-[20px_36px_minmax(0,1fr)_84px] max-md:gap-2">
              <span className="text-right text-sm text-muted-foreground tabular-nums">{i + 1}</span>
              {p.thumbnailUrl ? (
                <img src={p.thumbnailUrl} alt="" className="size-10 rounded-md border object-cover max-md:size-9" />
              ) : (
                <span aria-hidden="true" className="grid size-10 place-items-center rounded-md bg-muted font-semibold text-muted-foreground max-md:size-9">
                  {p.name.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0">
                <Link to="/catalog/$productId" params={{ productId: p.productId }} className="block truncate font-medium text-foreground no-underline hover:underline">
                  {p.name}
                </Link>
                <m.i
                  aria-hidden="true"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.5, delay: 0.1 + i * 0.03, ease: [0.2, 0.8, 0.2, 1] }}
                  className="mt-1.5 block h-1.5 origin-left rounded-r bg-primary-fill"
                  style={{ width: `${p.share * 100}%` }}
                />
              </div>
              <span className="text-right tabular-nums max-md:hidden">{p.units}</span>
              <span className="text-right font-semibold tabular-nums">{money(p.revenue, dto.currency)}</span>
            </li>
          ))}
        </ol>
      </section>
      <aside className="grid content-start gap-7">
        <SideList tour="insights.up" title="Moving up" empty="Nothing has climbed this period.">
          {up.map((x) => (
            <Row key={x.product.productId} title={x.product.name} note={`Now number ${x.rank}`}>
              <Places places={x.places} />
            </Row>
          ))}
        </SideList>
        <SideList tour="insights.slipping" title="Slipping" empty="Nothing has slipped this period.">
          {down.map((x) => (
            <Row key={x.product.productId} title={x.product.name} note={`Now number ${x.rank}`}>
              <Places places={x.places} />
            </Row>
          ))}
        </SideList>
        <SideList tour="insights.oos" title="Selling but out of stock" empty="Everything that is selling is in stock.">
          {out.map((a) => (
            <Row key={a.variantId} title={a.name} note={`Sold ${a.soldLast7Days} in the last 7 days`}>
              <Button variant="outline" asChild>
                <Link to={`/catalog/${a.productId}?size=${a.variantId}` as never}>Restock</Link>
              </Button>
            </Row>
          ))}
        </SideList>
      </aside>
    </div>
  )
}

function SideList({ title, empty, tour, children }: { title: string; empty: string; tour?: string; children: ReactNode[] }) {
  return (
    <section aria-label={title} data-tour={tour}>
      <h2 className="mb-1 text-[15px] font-semibold">{title}</h2>
      {children.length > 0 ? children : <p className="py-2 text-sm text-muted-foreground">{empty}</p>}
    </section>
  )
}

function Row({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b py-2.5 last:border-b-0">
      <p>
        {title}
        <small className="block text-sm text-muted-foreground">{note}</small>
      </p>
      {children}
    </div>
  )
}

function Places({ places }: { places: number }) {
  const Icon = places > 0 ? ArrowUp : ArrowDown
  const n = Math.abs(places)
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm", places > 0 ? "text-success" : "text-destructive")}>
      <Icon aria-hidden="true" className="size-3.5" />
      {n} {n === 1 ? "place" : "places"}
    </span>
  )
}

export function ServicePage({ dto }: { dto: Dto }) {
  const { foundRate, cantSupplyRate, averageTimeToReady, readySpread } = dto.quality
  const labels = bucketLabels(dto)
  const buckets = dto.series.buckets
  const against = `on ${dto.briefing.comparedWith}`
  const peak = Math.max(0, ...readySpread)
  const finished = readySpread.reduce((n, x) => n + x, 0)
  return (
    <>
      <div className="grid grid-cols-3 gap-8 max-md:grid-cols-1 max-md:gap-5">
        <Measure tour="insights.found" title="Found rate" value={foundRate ? `${foundRate.value}%` : "-"} figure={foundRate} unit=" pts" against={against}>
          <LineChart compact labels={labels} current={buckets.map((b) => num(b.foundRate))} format={(n) => `${n.toFixed(1)}%`} names={["Found rate"]} label="Found rate over the period" className="mt-2.5" />
        </Measure>
        <Measure tour="insights.cant" title="Can't supply" value={cantSupplyRate ? `${cantSupplyRate.value}%` : "-"} figure={cantSupplyRate} unit=" pts" goodWhenUp={false} against={against}>
          <LineChart compact labels={labels} current={buckets.map((b) => num(b.cantSupplyRate))} format={(n) => `${n.toFixed(1)}%`} names={["Can't supply"]} label="Can't supply over the period" className="mt-2.5" />
        </Measure>
        <Measure tour="insights.ready" title="Time to ready" value={averageTimeToReady ? minutes(averageTimeToReady.value) : "-"} figure={averageTimeToReady} goodWhenUp={false} against={against}>
          <LineChart compact labels={labels} current={buckets.map((b) => b.averageTimeToReady)} format={(n) => minutes(String(n))} names={["Time to ready"]} label="Time to ready over the period" className="mt-2.5" />
        </Measure>
      </div>

      <div className="mt-9 grid grid-cols-2 gap-10 max-lg:gap-6 max-md:grid-cols-1">
        <section aria-label="How long orders take to get ready">
          <h2 className="text-[15px] font-semibold">How long orders take to get ready</h2>
          {finished === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">Nothing finished in this period yet.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{spreadSentence(readySpread)}</p>
              <div role="img" aria-label={`Orders by minutes to ready: ${READY_SPREAD_LABELS.map((l, i) => `${l}, ${readySpread[i]}`).join("; ")}`} className="mt-3 flex h-30 items-end gap-0.5">
                {readySpread.map((n, i) => (
                  <div key={READY_SPREAD_LABELS[i]} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 text-xs tabular-nums text-muted-foreground">
                    {n}
                    <m.i
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.45, delay: i * 0.04 }}
                      className="block w-6 origin-bottom rounded-t bg-primary-fill"
                      style={{ height: `${(n / peak) * 80}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-0.5 text-xs text-muted-foreground">
                {READY_SPREAD_LABELS.map((l) => (
                  <span key={l} className="flex-1 text-center whitespace-nowrap">{l}</span>
                ))}
              </div>
              <p className="mt-1 text-center text-xs text-muted-foreground">Minutes from paid to ready</p>
            </>
          )}
        </section>
        <SideList tour="insights.missed" title="What you could not supply" empty="You supplied everything this period.">
          {dto.cantSupplyProducts.map((p) => (
            <Row key={p.productId} title={p.name} note={`${p.units} ${p.units === 1 ? "unit" : "units"}`}>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/catalog/$productId" params={{ productId: p.productId }}>
                  Open
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </Row>
          ))}
        </SideList>
      </div>
    </>
  )
}

function Measure({
  title,
  value,
  figure,
  unit,
  goodWhenUp,
  against,
  tour,
  children,
}: {
  title: string
  value: string
  figure: InsightsFigureDTO | null
  unit?: string
  goodWhenUp?: boolean
  against: string
  /** A guided-tour key (106). */
  tour?: string
  children: ReactNode
}) {
  return (
    <section aria-label={title} data-tour={tour}>
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-4xl leading-11 font-semibold tracking-[-.03em]">{value}</p>
      {figure ? <Delta figure={figure} unit={unit} goodWhenUp={goodWhenUp} label={against} /> : <span className="text-sm text-muted-foreground">Nothing finished yet</span>}
      {children}
    </section>
  )
}
