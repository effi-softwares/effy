import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link, type LinkProps } from "@tanstack/react-router"
import { ChartLine, Minus, Table2, TrendingDown, TrendingUp } from "lucide-react"

import { cn } from "@effy/design-system"
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui"
import type { AdminOrdersTodayDTO } from "@effy/shared-types"
import { Bone, Loading } from "@effy/web-kit/patterns"

import { ordersTodayQuery } from "@/features/orders/queries"

import { clockWords, plural } from "./model"
import { money } from "./overviewFormat"
import { CouldNotLoad, Section } from "./Section"

type Metric = "orders" | "sales"
const weekday = (date: string) =>
  new Intl.DateTimeFormat("en-AU", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))
const whole = (v: number) => new Intl.NumberFormat("en-AU").format(v)
const dollars = (v: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: v >= 1000 ? 0 : 2,
  }).format(v)

/** Placed since midnight, against the same weekday last week: the figure above its chart. */
export function OrdersToday({ nowH }: { nowH: number }) {
  const today = useQuery(ordersTodayQuery())
  const [metric, setMetric] = useState<Metric>("orders")
  const [asTable, setAsTable] = useState(false)
  const t = today.data
  const last = t ? `last ${weekday(t.lastWeek.date)}` : "last week"

  return (
    <Section
      id="ov-biz-t"
      tour="overview.today"
      order={5}
      className="@container"
      title="Orders today"
      description={`Placed since midnight, against ${last} at this time.`}
      actions={
        t ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={asTable ? "Show as a chart" : "Show as a table"}
            title={asTable ? "Show as a chart" : "Show as a table"}
            aria-pressed={asTable}
            onClick={() => setAsTable(!asTable)}
          >
            {asTable ? <ChartLine aria-hidden="true" /> : <Table2 aria-hidden="true" />}
          </Button>
        ) : null
      }
    >
      {today.isError ? (
        <CouldNotLoad what="today’s figures" service="orders service" />
      ) : !t ? (
        <Loading label="Loading today’s orders">
          <div className="grid grid-cols-4 gap-px border-y bg-border @max-[640px]:grid-cols-2">
            {["Orders placed", "Sales", "Average order", "Delivered on time"].map((f) => (
              <div key={f} className="grid gap-1 bg-background px-3.5 py-3 first:pl-0">
                <span className="text-[13px] text-muted-foreground">{f}</span>
                <Bone kind="heading" className="h-6 w-16" />
                <Bone className="h-3 w-24" />
              </div>
            ))}
          </div>
          <div className="h-[236px]" />
        </Loading>
      ) : (
        <Loaded t={t} last={last} metric={metric} setMetric={setMetric} asTable={asTable} nowH={nowH} />
      )}
    </Section>
  )
}

function Loaded({
  t,
  last,
  metric,
  setMetric,
  asTable,
  nowH,
}: {
  t: AdminOrdersTodayDTO
  last: string
  metric: Metric
  setMetric: (m: Metric) => void
  asTable: boolean
  nowH: number
}) {
  const orders = Number(t.effy) + Number(t.courier)
  const paid = orders - Number(t.cancelled)
  const sales = Number(t.sales.amount)
  const avg = paid > 0 ? sales / paid : null
  const prevOrders = Number(t.lastWeek.orders)
  const prevSales = Number(t.lastWeek.sales)
  const prevAvg = prevOrders > 0 ? prevSales / prevOrders : null
  const on = t.onTime
  const rate = Number(on.delivered) ? Math.round((Number(on.onTime) / Number(on.delivered)) * 100) : null
  const rate7 = Number(on.last7.delivered)
    ? Math.round((Number(on.last7.onTime) / Number(on.last7.delivered)) * 100)
    : null
  const day = { placedFrom: t.date, placedTo: t.date }
  // "vs last Thu"
  const short = `vs ${last.slice(0, 8)}`

  return (
    <>
      <div
        role="tablist"
        aria-label="Which figure to chart"
        className="grid grid-cols-4 gap-px border-y bg-border @max-[640px]:grid-cols-2"
      >
        <Figure
          label="Orders placed"
          value={whole(orders)}
          delta={<Delta now={orders} before={prevOrders} label={short} />}
          selected={metric === "orders"}
          onSelect={() => setMetric("orders")}
        />
        <Figure
          label="Sales"
          value={dollars(sales)}
          delta={<Delta now={sales} before={prevSales} label={short} />}
          selected={metric === "sales"}
          onSelect={() => setMetric("sales")}
        />
        <Figure
          label="Average order"
          value={avg === null ? "-" : money(avg.toFixed(2), "AUD")}
          delta={
            avg !== null && prevAvg !== null ? (
              <Delta now={avg} before={prevAvg} label={short} />
            ) : (
              <span className="text-[12.5px] text-muted-foreground">Nothing yet</span>
            )
          }
        />
        <Figure
          label="Delivered on time"
          value={rate === null ? "-" : `${rate}%`}
          delta={
            <span className="text-[12.5px] whitespace-nowrap text-muted-foreground">
              {rate === null
                ? "Nothing delivered yet"
                : `${on.onTime} of ${on.delivered}${rate7 !== null ? ` · 7-day ${rate7}%` : ""}`}
            </span>
          }
        />
      </div>
      <div className="mt-3.5 grid grid-cols-[minmax(0,1fr)_248px] gap-x-8 @max-[640px]:grid-cols-1 @max-[640px]:gap-y-4">
        <div className="min-w-0">
          {asTable ? (
            <HourTable t={t} metric={metric} last={last} nowH={nowH} />
          ) : (
            <HourChart t={t} metric={metric} last={last} nowH={nowH} />
          )}
        </div>
        <div>
          <div aria-hidden="true" className="mt-0.5 mb-2.5 flex h-2 gap-0.5">
            <i className="block rounded-l-sm" style={{ flex: Number(t.effy) || 1, background: "var(--series)" }} />
            <i
              className="block rounded-r-sm"
              style={{ flex: Number(t.courier) || 1, background: "var(--series-prev)" }}
            />
          </div>
          <ul className="border-t">
            <SplitRow
              link={{ to: "/orders", search: { deliveryType: "effy", ...day } } as LinkProps}
              swatch="var(--series)"
              label="Delivered by Effy"
              value={plural(Number(t.effy), "order")}
            />
            <SplitRow
              link={{ to: "/orders", search: { deliveryType: "courier", ...day } } as LinkProps}
              swatch="var(--series-prev)"
              label="Courier delivery"
              value={plural(Number(t.courier), "order")}
            />
            <SplitRow
              label="Refunded"
              value={`${plural(Number(t.refunded.orders), "order")}${Number(t.refunded.orders) > 0 ? ` · ${money(t.refunded.amount, t.refunded.currency)}` : ""}`}
            />
            <SplitRow
              link={{ to: "/orders", search: { status: "canceled", ...day } } as LinkProps}
              label="Cancelled"
              value={plural(Number(t.cancelled), "order")}
            />
          </ul>
        </div>
      </div>
    </>
  )
}

function Figure({
  label,
  value,
  delta,
  selected,
  onSelect,
}: {
  label: string
  value: string
  delta: ReactNode
  selected?: boolean
  onSelect?: () => void
}) {
  const body = (
    <>
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <b className="text-2xl leading-[30px] font-semibold tracking-[-0.025em]">{value}</b>
      {delta}
    </>
  )
  const cls =
    "relative grid content-start gap-0.5 bg-background px-3.5 py-3 text-left first:pl-0 @max-[640px]:[&:nth-child(3)]:pl-0"
  return onSelect ? (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        cls,
        "cursor-pointer hover:bg-row-hover",
        selected && "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground",
      )}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  if (before <= 0)
    return <span className="text-[12.5px] text-muted-foreground">Nothing {label.replace("vs ", "")}</span>
  const p = ((now - before) / before) * 100
  const dir = Math.abs(p) < 0.5 ? "flat" : p > 0 ? "up" : "down"
  const Icon = dir === "flat" ? Minus : dir === "up" ? TrendingUp : TrendingDown
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[12.5px] whitespace-nowrap text-muted-foreground",
        dir === "up" && "text-success",
        dir === "down" && "text-destructive",
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {Math.abs(p).toFixed(0)}% {label}
    </span>
  )
}

function SplitRow({ link, swatch, label, value }: { link?: LinkProps; swatch?: string; label: string; value: string }) {
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        {swatch ? <i className="ov-sw" style={{ background: swatch }} /> : null}
        {label}
      </span>
      <b className="font-medium whitespace-nowrap tabular-nums">{value}</b>
    </>
  )
  const cls = "flex items-baseline justify-between gap-3 border-b py-2"
  return (
    <li>
      {link ? (
        <Link {...link} className={cn(cls, "no-underline hover:bg-row-hover")}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  )
}

// ── The chart ───────────────────────────────────────────────────────────────────────────────────

function series(t: AdminOrdersTodayDTO, metric: Metric, nowH: number) {
  const hours = t.hours.map((h) => ({
    hour: Number(h.hour),
    cur: metric === "orders" ? Number(h.orders) : Number(h.sales),
    prev: metric === "orders" ? Number(h.lastWeekOrders) : Number(h.lastWeekSales),
  }))
  const firstBusy = hours.find((h) => h.cur > 0 || h.prev > 0)?.hour ?? 6
  const from = Math.min(6, firstBusy)
  const nowHour = Math.floor(nowH)
  return hours.filter((h) => h.hour >= from).map((h) => ({ ...h, cur: h.hour <= nowHour ? h.cur : null }))
}

function HourTable({ t, metric, last, nowH }: { t: AdminOrdersTodayDTO; metric: Metric; last: string; nowH: number }) {
  const fmt = metric === "orders" ? whole : dollars
  return (
    <div className="max-h-[260px] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Hour</TableHead>
            <TableHead numeric>Today</TableHead>
            <TableHead numeric className="first-letter:uppercase">
              {last}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {series(t, metric, nowH).map((h) => (
            <TableRow key={h.hour}>
              <TableCell>{clockWords(h.hour)}</TableCell>
              <TableCell numeric>{h.cur === null ? "-" : fmt(h.cur)}</TableCell>
              <TableCell numeric>{fmt(h.prev)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** Today against last week, per hour: one axis, a legend, a crosshair read-out by pointer or arrow keys. */
function HourChart({ t, metric, last, nowH }: { t: AdminOrdersTodayDTO; metric: Metric; last: string; nowH: number }) {
  const host = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [at, setAt] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e!.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const d = series(t, metric, nowH)
  const fmt = metric === "orders" ? whole : dollars
  const H = 220
  const m = { t: 10, r: 44, b: 22, l: metric === "sales" ? 52 : 30 }
  const top = Math.max(1, ...d.map((p) => p.prev), ...d.map((p) => p.cur ?? 0))
  const mag = 10 ** Math.floor(Math.log10(top / 4 || 1))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k * 4 >= top) ?? top / 4
  const max = step * 4
  const n = Math.max(1, d.length - 1)
  const x = (i: number) => m.l + (i / n) * (w - m.l - m.r)
  const y = (v: number) => m.t + (1 - v / max) * (H - m.t - m.b)
  const path = (vals: (number | null)[]) =>
    vals
      .map((v, i) =>
        v === null ? "" : `${i === 0 || vals[i - 1] === null ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`,
      )
      .join(" ")
  const lastI = d.reduce((a, p, i) => (p.cur === null ? a : i), -1)
  const every = w < 420 ? 4 : 3
  const pick = at ?? lastI

  const tip = at !== null ? d[at] : null
  const pct = tip && tip.cur !== null && tip.prev > 0 ? ((tip.cur - tip.prev) / tip.prev) * 100 : null

  return (
    <>
      <div className="mb-1.5 flex items-center gap-3.5 text-[12.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden="true" viewBox="0 0 18 4" className="h-1 w-[18px]">
            <line x1="0" y1="2" x2="18" y2="2" stroke="var(--series)" strokeWidth="2" />
          </svg>
          Today
        </span>
        <span className="inline-flex items-center gap-1.5 first-letter:uppercase">
          <svg aria-hidden="true" viewBox="0 0 18 4" className="h-1 w-[18px]">
            <line
              x1="0"
              y1="2"
              x2="18"
              y2="2"
              stroke="var(--series-prev)"
              strokeWidth="2"
              strokeDasharray="2 5"
              strokeLinecap="round"
            />
          </svg>
          <span className="first-letter:uppercase">{last}</span>
        </span>
        <span className="ml-auto">{metric === "sales" ? "Sales" : "Orders"} per hour</span>
      </div>
      <div ref={host} className="ov-chart">
        {w > 0 ? (
          <svg
            role="img"
            tabIndex={0}
            aria-label={`${metric === "sales" ? "Sales" : "Orders"} per hour, today against ${last}. Use the arrow keys to read each hour.`}
            viewBox={`0 0 ${w} ${H}`}
            className="outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setAt(Math.max(0, Math.min(d.length - 1, Math.round(((e.clientX - r.left - m.l) / (w - m.l - m.r)) * n))))
            }}
            onPointerLeave={() => setAt(null)}
            onFocus={() => setAt(pick < 0 ? 0 : pick)}
            onBlur={() => setAt(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setAt(Math.min((at ?? 0) + 1, d.length - 1))
              if (e.key === "ArrowLeft") setAt(Math.max((at ?? 0) - 1, 0))
            }}
          >
            {[0, 1, 2, 3, 4].map((k) => (
              <g key={k}>
                <line x1={m.l} x2={w - m.r} y1={y(k * step)} y2={y(k * step)} stroke="var(--border)" strokeWidth="1" />
                <text x={m.l - 8} y={y(k * step) + 4} textAnchor="end">
                  {fmt(k * step)}
                </text>
              </g>
            ))}
            {d.map((p, i) =>
              i % every === 0 ? (
                <text key={p.hour} x={x(i)} y={H - 4} textAnchor={i === 0 ? "start" : "middle"}>
                  {clockWords(p.hour)}
                </text>
              ) : null,
            )}
            <path
              d={path(d.map((p) => p.prev))}
              fill="none"
              stroke="var(--series-prev)"
              strokeWidth="2"
              strokeDasharray="2 5"
              strokeLinecap="round"
            />
            {lastI > 0 ? (
              <path
                d={`${path(d.map((p) => p.cur))} L${x(lastI)} ${y(0)} L${x(0)} ${y(0)} Z`}
                fill="var(--series)"
                opacity="0.08"
              />
            ) : null}
            <path
              d={path(d.map((p) => p.cur))}
              fill="none"
              stroke="var(--series)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {lastI >= 0 ? (
              <>
                <circle
                  cx={x(lastI)}
                  cy={y(d[lastI]!.cur!)}
                  r="4"
                  fill="var(--series)"
                  stroke="var(--background)"
                  strokeWidth="2"
                />
                <text data-end="" x={x(lastI) + 8} y={y(d[lastI]!.cur!) - 6}>
                  {fmt(d[lastI]!.cur!)}
                </text>
              </>
            ) : null}
            {at !== null ? (
              <line
                x1={x(at)}
                x2={x(at)}
                y1={m.t}
                y2={H - m.b}
                stroke="var(--foreground)"
                strokeWidth="1"
                opacity="0.35"
              />
            ) : null}
          </svg>
        ) : null}
        {tip ? (
          <div
            className="ov-tip absolute"
            style={{ position: "absolute", left: Math.min(Math.max(x(at!) - 90, 0), Math.max(0, w - 190)), top: -6 }}
          >
            <b>{clockWords(tip.hour)}</b>
            {tip.cur !== null ? (
              <div>
                <i className="ov-sw h-0.5 w-3" style={{ background: "var(--series)" }} />
                Today
                <strong>{fmt(tip.cur)}</strong>
              </div>
            ) : null}
            <div>
              <i className="ov-sw h-0.5 w-3" style={{ background: "var(--series-prev)" }} />
              <span className="first-letter:uppercase">{last}</span>
              <strong>{fmt(tip.prev)}</strong>
            </div>
            {pct !== null ? (
              <div className="ov-tip__foot">
                {pct >= 0 ? "+" : ""}
                {pct.toFixed(0)}% on {last}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  )
}
