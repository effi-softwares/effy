import { useState } from "react"

import { Link } from "@tanstack/react-router"
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, Minus, Table2 } from "lucide-react"

import { cn } from "@effy/design-system"
import { Button } from "@effy/design-system/ui"
import { DELIVERED_BY_WORDS, type InsightsFigureDTO, type ShopInsightsDTO, type ShopTodayDTO } from "@effy/shared-types"
import { StaticTable } from "@effy/web-kit/data-table"
import { Bone, Loading } from "@effy/web-kit/patterns"

import { BoardSection, CouldNotLoad } from "@/components/console/BoardSection"
import { ChartLegend, LineChart } from "@/features/insights/LineChart"
import { changeOf, hourWords, minutes, money, moneyCents } from "@/features/insights/model"

import { plural } from "./model"

type Measure = "orders" | "sales"

function Delta({ figure, goodWhenUp = true, unit = "%", against }: { figure: InsightsFigureDTO | null; goodWhenUp?: boolean; unit?: string; against: string }) {
  const c = figure ? changeOf(figure, unit, goodWhenUp) : null
  if (!c) return <span className="text-[12.5px] text-muted-foreground">Nothing to compare yet</span>
  const Icon = c.direction === "up" ? ArrowUp : c.direction === "down" ? ArrowDown : Minus
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12.5px] whitespace-nowrap", c.tone === "good" ? "text-success" : c.tone === "bad" ? "text-destructive" : "text-muted-foreground")}>
      <Icon aria-hidden="true" className="size-3" />
      <span className="sr-only">{c.direction === "up" ? "Up" : c.direction === "down" ? "Down" : "No change"} </span>
      {c.text} <span className="text-muted-foreground">vs {against}</span>
    </span>
  )
}

/** Since midnight, against the same weekday last week at this time: the figures, the hours, and who takes them. */
export function OrdersToday({
  sales,
  failed,
  today,
}: {
  sales: ShopInsightsDTO | undefined
  failed: boolean
  today: ShopTodayDTO | undefined
}) {
  const [measure, setMeasure] = useState<Measure>("orders")
  const [asTable, setAsTable] = useState(false)
  const weekday = today ? new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: today.timezone }).format(new Date(today.now)) : ""
  const against = `last ${weekday}`
  return (
    <BoardSection
      id="td-sales-t"
      tour="today.sales"
      order={5}
      title="Orders today"
      description="Since midnight, against the same day last week at this time. Your goods only."
      actions={
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label={asTable ? "Show chart" : "Show table"}
            title={asTable ? "Show chart" : "Show table"}
            aria-pressed={asTable}
            onClick={() => setAsTable(!asTable)}
          >
            {asTable ? <BarChart3 aria-hidden="true" /> : <Table2 aria-hidden="true" />}
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/insights" search={{ range: "today" } as never}>
              Insights
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </>
      }
    >
      {failed ? (
        <CouldNotLoad what="today’s figures. Your orders and drivers above are unaffected" />
      ) : !sales || !today ? (
        <OrdersTodaySkeleton />
      ) : (
        <Body sales={sales} today={today} measure={measure} setMeasure={setMeasure} asTable={asTable} against={against} />
      )}
    </BoardSection>
  )
}

function Body({
  sales,
  today,
  measure,
  setMeasure,
  asTable,
  against,
}: {
  sales: ShopInsightsDTO
  today: ShopTodayDTO
  measure: Measure
  setMeasure: (m: Measure) => void
  asTable: boolean
  against: string
}) {
  const { revenue, orders, averageOrderValue } = sales.primary
  const ready = sales.quality.averageTimeToReady
  const buckets = sales.series.buckets
  const labels = buckets.map((b) => hourWords(Number(b.label)))
  const current = buckets.map((b) => (measure === "orders" ? b.orders : Number(b.revenue)))
  const previous = buckets.map((b) => (measure === "orders" ? b.previousOrders : b.previousRevenue === null ? null : Number(b.previousRevenue)))
  const fmt = measure === "orders" ? (n: number) => String(Math.round(n)) : (n: number) => money(String(n), sales.currency)
  const effy = Object.values(today.packages.effy_driver).reduce((n, x) => n + x, 0)
  const courier = Object.values(today.packages.courier).reduce((n, x) => n + x, 0)
  const tab = (m: Measure, label: string, value: string, figure: InsightsFigureDTO) => (
    <button
      type="button"
      role="tab"
      aria-selected={measure === m}
      onClick={() => setMeasure(m)}
      className={cn(
        "relative grid content-start gap-0.5 border-l px-3.5 py-3 text-left first:border-l-0 hover:bg-row-hover",
        measure === m && "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground",
      )}
    >
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <b className="text-2xl leading-[30px] font-semibold tracking-[-0.025em] tabular-nums">{value}</b>
      <Delta figure={figure} against={against} />
    </button>
  )
  return (
    <>
      <div role="tablist" aria-label="Which figure to chart" className="grid grid-cols-4 border-y max-md:grid-cols-2">
        {tab("orders", "Orders", orders.value, orders)}
        {tab("sales", "Sales", money(revenue.value, sales.currency), revenue)}
        <div className="grid content-start gap-0.5 border-l px-3.5 py-3 max-md:border-t max-md:border-l-0">
          <span className="text-[13px] text-muted-foreground">Average order</span>
          <b className="text-2xl leading-[30px] font-semibold tracking-[-0.025em] tabular-nums">{Number(orders.value) ? moneyCents(averageOrderValue.value, sales.currency) : "-"}</b>
          {Number(orders.value) ? <Delta figure={averageOrderValue} against={against} /> : <span className="text-[12.5px] text-muted-foreground">Nothing yet</span>}
        </div>
        <div className="grid content-start gap-0.5 border-l px-3.5 py-3 max-md:border-t">
          <span className="text-[13px] text-muted-foreground">Time to ready</span>
          <b className="text-2xl leading-[30px] font-semibold tracking-[-0.025em] tabular-nums">{ready ? minutes(ready.value) : "-"}</b>
          {ready ? <Delta figure={ready} goodWhenUp={false} against={against} /> : <span className="text-[12.5px] text-muted-foreground">Nothing packed yet</span>}
        </div>
      </div>
      <div className="mt-3.5 grid grid-cols-[minmax(0,1fr)_248px] gap-x-8 gap-y-4 max-lg:grid-cols-1">
        <div className="min-w-0">
          {asTable ? (
            <StaticTable
              label={`${measure === "orders" ? "Orders" : "Sales"} per hour, today against ${against}`}
              rows={labels.map((l, i) => ({ l, now: current[i] ?? null, then: previous[i] ?? null }))}
              getRowId={(r) => r.l}
              columns={[
                { id: "hour", header: "Hour", accessorFn: (r) => r.l },
                { id: "now", header: "Today", cell: ({ row }) => (row.original.now === null ? "-" : fmt(row.original.now)) },
                { id: "then", header: `Last ${against.replace("last ", "")}`, cell: ({ row }) => (row.original.then === null ? "-" : fmt(row.original.then)) },
              ]}
            />
          ) : (
            <>
              <div className="mb-1.5 flex items-center gap-3">
                <ChartLegend names={["Today", `Last ${against.replace("last ", "")}`]} />
                <span className="ml-auto text-[12.5px] text-muted-foreground">{measure === "orders" ? "Orders" : "Sales"} per hour</span>
              </div>
              <LineChart
                labels={labels}
                current={current}
                previous={previous}
                format={fmt}
                names={["Today", `Last ${against.replace("last ", "")}`]}
                label={`${measure === "orders" ? "Orders" : "Sales"} per hour, today against ${against}`}
                height={220}
              />
            </>
          )}
        </div>
        <div>
          <div aria-hidden="true" className="mt-0.5 mb-2.5 flex h-2 gap-0.5">
            <i className="block rounded-l-sm bg-primary-fill" style={{ flex: effy || 1 }} />
            <i className="block rounded-r-sm bg-muted-foreground" style={{ flex: courier || 1 }} />
          </div>
          <ul className="border-t text-sm">
            <Item to="/orders?deliveredBy=effy_driver" label={DELIVERED_BY_WORDS.effy_driver} swatch="bg-primary-fill" value={plural(effy, "order")} />
            <Item to="/orders?deliveredBy=courier" label={DELIVERED_BY_WORDS.courier} swatch="bg-muted-foreground" value={plural(courier, "order")} />
            <Item to="/insights/service" label="Couldn’t supply" value={plural(sales.secondary.cantSupply.units, "item")} />
            <Item
              to="/orders?payment=refunded"
              label="Refunded"
              value={`${plural(sales.secondary.refunds.orders, "order")}${sales.secondary.refunds.orders ? ` · ${moneyCents(sales.secondary.refunds.value, sales.currency)}` : ""}`}
            />
            <Item to="/orders?tab=withdrawn" label="Cancelled" value={plural(Number(sales.secondary.cancelled.value), "order")} />
          </ul>
          {today.yesterday ? (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Yesterday: {plural(today.yesterday.orders, "order")} · {money(today.yesterday.revenue, sales.currency)}
            </p>
          ) : null}
        </div>
      </div>
    </>
  )
}

function Item({ to, label, value, swatch }: { to: string; label: string; value: string; swatch?: string }) {
  return (
    <li>
      <Link to={to as never} className="flex items-baseline justify-between gap-3 border-b py-2 no-underline hover:bg-row-hover">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          {swatch ? <i aria-hidden="true" className={cn("size-2.5 rounded-[3px]", swatch)} /> : null}
          {label}
        </span>
        <b className="font-medium whitespace-nowrap tabular-nums">{value}</b>
      </Link>
    </li>
  )
}

function OrdersTodaySkeleton() {
  return (
    <Loading label="Loading today’s figures">
      <div className="grid grid-cols-4 border-y max-md:grid-cols-2">
        {["Orders", "Sales", "Average order", "Time to ready"].map((l) => (
          <div key={l} className="grid gap-1.5 border-l px-3.5 py-3 first:border-l-0">
            <span className="text-[13px] text-muted-foreground">{l}</span>
            <Bone kind="heading" className="h-6 w-16" />
            <Bone className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="mt-3.5 h-[220px]" />
    </Loading>
  )
}
