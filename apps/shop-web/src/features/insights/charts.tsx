import type { ReactNode } from "react"

import { Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"

import { cn } from "@effy/design-system"
import { DELIVERED_BY_WORDS, ORDER_SIZE_LABELS, READY_SPREAD_LABELS, type InsightsFigureDTO, type ShopInsightsDTO } from "@effy/shared-types"

import { Delta } from "./Delta"
import { LineChart } from "./LineChart"
import {
  bucketLabels,
  busiest,
  commonestSize,
  hourWords,
  minutes,
  money,
  PAGE_PATH,
  periodNames,
  plural,
  RANGE_IN,
  rangeWords,
  spreadSentence,
  timeWords,
  WEEKDAY_NAME,
  WEEKDAY_SHORT,
  worstRun,
} from "./model"
import { Rhythm, shade } from "./Rhythm"

type Dto = ShopInsightsDTO
export type ChartPage = "sales" | "service"

/** One chart: a card that says its finding and gives a glimpse, and its own page with the whole chart and a table. */
export interface ChartDef {
  slug: string
  page: ChartPage
  label: string
  title: string
  finding: (d: Dto) => string
  sub: (d: Dto) => string
  mini: (d: Dto) => ReactNode
  full: (d: Dto) => ReactNode
  table: (d: Dto) => { head: string[]; rows: (string | number)[][] }
  how: string
  /** A measure card shows its value and change instead of a sentence. */
  measure?: { value: (d: Dto) => string; figure: (d: Dto) => InsightsFigureDTO | null; unit: string; goodWhenUp: boolean }
}

// ---- small pieces -------------------------------------------------------------------------------------------------

function MiniBars({ values, hi }: { values: readonly (number | null)[]; hi: number }) {
  const max = Math.max(1, ...values.filter((v): v is number => v !== null))
  return (
    <span className="flex h-full items-end gap-[3px]">
      {values.map((v, i) => (
        <i
          key={i}
          className={cn("block min-w-0 flex-1 rounded-t-[2px] bg-primary-fill", i === hi ? "opacity-100" : "opacity-40")}
          style={{ height: `${v === null ? 0 : Math.max(4, (v / max) * 100)}%` }}
        />
      ))}
    </span>
  )
}

function MiniBarsH({ values }: { values: readonly number[] }) {
  const max = Math.max(1, ...values)
  return (
    <span className="grid h-full content-center gap-[7px]">
      {values.slice(0, 4).map((v, i) => (
        <i key={i} className="block h-[9px] rounded-r-[3px] bg-primary-fill" style={{ width: `${(v / max) * 100}%` }} />
      ))}
    </span>
  )
}

function Spark({ values, label }: { values: readonly (number | null)[]; label: string }) {
  const pts = values.map((v, i) => [v, i] as const).filter((p): p is readonly [number, number] => p[0] !== null)
  if (pts.length < 2) return <span className="block h-full" />
  const lo = Math.min(...pts.map((p) => p[0]))
  const hi = Math.max(...pts.map((p) => p[0]))
  const span = hi - lo || 1
  const n = Math.max(values.length - 1, 1)
  const d = pts.map(([v, i], k) => `${k ? "L" : "M"}${((i / n) * 100).toFixed(2)} ${(36 - ((v - lo) / span) * 32).toFixed(2)}`).join(" ")
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={label} className="block h-full w-full overflow-visible">
      <path d={d} vectorEffect="non-scaling-stroke" className="fill-none stroke-primary-fill" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** Columns with their value on top; the one that matters is darker. Bars start at zero. */
export function Columns({
  values,
  labels,
  hi,
  label,
  format = String,
  axis,
}: {
  values: readonly (number | null)[]
  labels: readonly string[]
  hi: number
  label: string
  format?: (n: number) => string
  axis?: string
}) {
  const max = Math.max(1, ...values.filter((v): v is number => v !== null))
  return (
    <>
      <div
        role="img"
        aria-label={`${label}: ${labels.map((l, i) => `${l}, ${values[i] === null ? "nothing yet" : format(values[i]!)}`).join("; ")}`}
        className="flex h-[300px] items-end gap-1 border-b pt-1 max-md:h-[220px]"
      >
        {values.map((v, i) => (
          <div key={labels[i]} className={cn("flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 text-xs tabular-nums", i === hi ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {v === null ? "" : format(v)}
            <i
              className={cn("block w-[min(28px,80%)] origin-bottom animate-[grow-y_.5s_cubic-bezier(.2,.8,.2,1)_both] rounded-t-[3px] bg-primary-fill", i === hi ? "opacity-100" : "opacity-45")}
              style={{ height: `${v === null ? 0 : Math.max(2, (v / max) * 82)}%`, animationDelay: `${i * 30}ms` }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-1 flex gap-1 text-xs text-muted-foreground">
        {labels.map((l, i) => (
          <span key={`${l}-${i}`} className="min-w-0 flex-1 text-center whitespace-nowrap">
            {l}
          </span>
        ))}
      </div>
      {axis ? <p className="mt-0.5 text-center text-xs text-muted-foreground">{axis}</p> : null}
    </>
  )
}

/** A ruled list of bars: a name, its bar, its figure. */
function Bars({ rows }: { rows: { key: string; name: string; value: number; label: ReactNode; note?: ReactNode; to?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="border-t">
      {rows.map((r, i) => {
        const body = (
          <>
            <span className="truncate">{r.name}</span>
            <span className="h-2 overflow-hidden rounded-r-[3px] bg-muted">
              <i
                className="block h-full origin-left animate-[grow-x_.5s_cubic-bezier(.2,.8,.2,1)_both] rounded-r-[3px] bg-primary-fill"
                style={{ width: `${(r.value / max) * 100}%`, animationDelay: `${i * 40}ms` }}
              />
            </span>
            <span className="text-right font-medium whitespace-nowrap tabular-nums">
              {r.label}
              {r.note ? <small className="block text-[12.5px] font-normal">{r.note}</small> : null}
            </span>
          </>
        )
        const cls = "grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_auto] items-center gap-x-3 border-b py-2 no-underline max-md:grid-cols-[minmax(0,110px)_minmax(0,1fr)_auto]"
        return (
          <li key={r.key}>
            {r.to ? (
              <Link to={r.to as never} className={cn(cls, "hover:bg-row-hover")}>
                {body}
              </Link>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** For each run, of the orders its driver came for, how many were ready. */
function RunsList({ d }: { d: Dto }) {
  if (d.runs.length === 0) return <p className="border-t py-3 text-sm text-muted-foreground">No Effy driver came for your orders {RANGE_IN[d.range]}.</p>
  return (
    <>
      <ul className="border-t">
        {d.runs.map((r) => {
          const miss = r.due - r.ready
          const p = Math.round((r.ready / Math.max(1, r.due)) * 100)
          return (
            <li key={r.time} className="grid grid-cols-[120px_minmax(0,1fr)_96px_64px] items-center gap-x-3.5 border-b py-2.5 max-md:grid-cols-[96px_minmax(0,1fr)_52px]">
              <span>
                <b className="block font-medium">{timeWords(r.time)}</b>
                <small className="block text-[12.5px] text-muted-foreground">{DELIVERED_BY_WORDS.effy_driver}</small>
              </span>
              <span aria-hidden="true" className="flex h-2.5 overflow-hidden rounded-[3px] bg-muted">
                <i className="block h-full" style={{ flex: r.ready, background: "var(--pkg-at-hub)" }} />
                {miss ? <i className="block h-full" style={{ flex: miss, background: "var(--pkg-problem)" }} /> : null}
              </span>
              <span className="text-right text-[13px] text-muted-foreground tabular-nums max-md:hidden">
                {r.ready} of {r.due}
              </span>
              <span className={cn("text-right font-semibold tabular-nums", p < 90 && "text-destructive")}>{p}%</span>
            </li>
          )
        })}
      </ul>
      <div className="mt-2 flex flex-wrap gap-3.5 text-[12.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <i className="ef-sw" style={{ background: "var(--pkg-at-hub)" }} />
          Ready in time
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="ef-sw" style={{ background: "var(--pkg-problem)" }} />
          Not ready
        </span>
      </div>
    </>
  )
}

const hiOf = (values: readonly (number | null)[]) => {
  const nums = values.map((v) => v ?? -1)
  const max = Math.max(...nums)
  return max <= 0 ? -1 : nums.indexOf(max)
}

/** Every hour from the first to the last with orders finished: an empty hour shows as a gap, not as nothing. */
function readyHours(d: Dto) {
  const rows = d.readyByHour
  if (rows.length === 0) return { hours: [] as number[], values: [] as (number | null)[] }
  const first = Math.min(...rows.map((r) => r.hour))
  const last = Math.max(...rows.map((r) => r.hour))
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i)
  const at = new Map(rows.map((r) => [r.hour, Math.round(r.seconds / 60)]))
  return { hours, values: hours.map((h) => at.get(h) ?? null) }
}

const rateLine = (pick: (b: Dto["series"]["buckets"][number]) => number | null, d: Dto, fmt: (n: number) => string, label: string) => (
  <LineChart fit labels={bucketLabels(d)} current={d.series.buckets.map(pick)} format={fmt} names={[periodNames(d.range)[0]]} label={label} height={360} />
)

const pct1 = (n: number) => `${n.toFixed(1)}%`

// ---- the charts ----------------------------------------------------------------------------------------------------

export const CHARTS: readonly ChartDef[] = [
  {
    slug: "by-aisle",
    page: "sales",
    label: "By aisle",
    title: "Sales by aisle",
    finding: (d) => (d.aisles[0] ? `${d.aisles[0].name} sells most: ${money(d.aisles[0].revenue, d.currency)}` : "Nothing sold yet"),
    sub: (d) => `${plural(d.aisles.length, "aisle")}, ${RANGE_IN[d.range]}`,
    mini: (d) => <MiniBarsH values={d.aisles.map((a) => Number(a.revenue))} />,
    full: (d) => (
      <Bars
        rows={d.aisles.map((a) => {
          const prev = a.previous === null ? null : Number(a.previous)
          const change = prev && prev > 0 ? ((Number(a.revenue) - prev) / prev) * 100 : null
          return {
            key: a.categoryId,
            name: a.name,
            value: Number(a.revenue),
            label: money(a.revenue, d.currency),
            note:
              change === null ? (
                <span className="text-muted-foreground">-</span>
              ) : (
                <Delta figure={{ value: a.revenue, previous: a.previous, change: { kind: "pct", amount: change.toFixed(0) } }} small />
              ),
            to: `/catalog?category=${a.categoryId}`,
          }
        })}
      />
    ),
    table: (d) => ({
      head: ["Aisle", periodNames(d.range)[0], periodNames(d.range)[1]],
      rows: d.aisles.map((a) => [a.name, money(a.revenue, d.currency), a.previous === null ? "-" : money(a.previous, d.currency)]),
    }),
    how: "Each product counts in the aisle at the top of its category. Goods sold at your prices, before refunds.",
  },
  {
    slug: "average-day",
    page: "sales",
    label: "Your average day",
    title: "Your average day",
    finding: (d) => {
      if (!d.weekdays) return "Appears after two weeks of orders"
      const i = hiOf(d.weekdays.map((w) => Number(w.revenue)))
      return i < 0 ? "Nothing sold in the last four weeks" : `${WEEKDAY_NAME[d.weekdays[i]!.weekday]} is your best day`
    },
    sub: () => "Last 4 weeks",
    mini: (d) => (d.weekdays ? <MiniBars values={d.weekdays.map((w) => Number(w.revenue))} hi={hiOf(d.weekdays.map((w) => Number(w.revenue)))} /> : null),
    full: (d) => {
      if (!d.weekdays) return <p className="text-sm text-muted-foreground">Your average day appears after two weeks of orders.</p>
      const values = d.weekdays.map((w) => Number(w.revenue))
      const i = hiOf(values)
      const avg = values.reduce((n, v) => n + v, 0) / 7
      return (
        <>
          {i >= 0 && avg > 0 ? (
            <p className="mb-3 text-[17px] leading-[25px] font-semibold">
              {WEEKDAY_NAME[d.weekdays[i]!.weekday]} sells {Math.round(((values[i]! - avg) / avg) * 100)}% more than your average day.
            </p>
          ) : null}
          <Columns values={values} labels={d.weekdays.map((w) => WEEKDAY_SHORT[w.weekday]!)} hi={i} label="Average sales by weekday" format={(n) => money(String(n), d.currency)} />
        </>
      )
    },
    table: (d) => ({ head: ["Weekday", "Average sales"], rows: (d.weekdays ?? []).map((w) => [WEEKDAY_NAME[w.weekday]!, money(w.revenue, d.currency)]) }),
    how: "Sales on each weekday, averaged over the last four weeks whatever range you chose, so one odd day doesn’t decide it.",
  },
  {
    slug: "when-orders-come-in",
    page: "sales",
    label: "When your orders come in",
    title: "When your orders come in",
    finding: (d) => {
      const b = busiest(d.rhythm)
      return b ? `${WEEKDAY_NAME[b.weekday]} around ${hourWords(b.hour)} is busiest` : "Appears after two weeks of orders"
    },
    sub: (d) => (d.rhythm ? `Last ${d.rhythm.weeks} weeks, by hour` : "Needs two weeks of orders"),
    mini: (d) => {
      if (!d.rhythm) return null
      const max = Math.max(1, ...d.rhythm.cells.map((c) => c.orders))
      const at = new Map(d.rhythm.cells.map((c) => [`${c.weekday}-${c.hour}`, c.orders]))
      const hours = Array.from({ length: 15 }, (_, i) => 7 + i)
      return (
        <span className="grid h-full gap-[2px]" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
          {[1, 2, 3, 4, 5, 6, 7].flatMap((w) =>
            hours.map((h) => {
              const v = at.get(`${w}-${h}`) ?? 0
              return <i key={`${w}-${h}`} className="rounded-[1.5px]" style={{ background: shade(v === 0 ? null : Math.min(7, Math.floor((v / max) * 8))) }} />
            }),
          )}
        </span>
      )
    },
    full: (d) => <Rhythm rhythm={d.rhythm} />,
    table: (d) => {
      const hours = Array.from(new Set((d.rhythm?.cells ?? []).map((c) => c.hour))).sort((a, b) => a - b)
      const at = new Map((d.rhythm?.cells ?? []).map((c) => [`${c.weekday}-${c.hour}`, c.orders]))
      const weeks = d.rhythm?.weeks ?? 1
      return {
        head: ["Weekday", ...hours.map((h) => hourWords(h))],
        rows: [1, 2, 3, 4, 5, 6, 7].map((w) => [WEEKDAY_NAME[w]!, ...hours.map((h) => ((at.get(`${w}-${h}`) ?? 0) / weeks).toFixed(1))]),
      }
    },
    how: "Orders by the weekday and hour they were paid, averaged over recent weeks. Darker means more orders.",
  },
  {
    slug: "order-size",
    page: "sales",
    label: "Order size",
    title: "Order size",
    finding: (d) => {
      const c = commonestSize(d.orderSizes)
      return c ? `Most orders have ${rangeWords(c)} items` : "Nothing sold yet"
    },
    sub: (d) => `Average ${d.primary.itemsPerOrder.value} items`,
    mini: (d) => <MiniBars values={d.orderSizes} hi={hiOf(d.orderSizes)} />,
    full: (d) => <Columns values={d.orderSizes} labels={ORDER_SIZE_LABELS} hi={hiOf(d.orderSizes)} label="Orders by number of items" axis="Your items in the order" />,
    table: (d) => ({ head: ["Items in the order", "Orders"], rows: d.orderSizes.map((n, i) => [ORDER_SIZE_LABELS[i]!, n]) }),
    how: "Your items in each order. An order may also carry other goods you never see.",
  },
  {
    slug: "who-buys",
    page: "sales",
    label: "Who takes them, who buys",
    title: "Who takes them, who buys",
    finding: (d) => {
      const all = d.customers.effyDriver + d.customers.courier
      return all ? `${Math.round((d.customers.effyDriver / all) * 100)}% go with an Effy driver` : "Nothing sold yet"
    },
    sub: (d) => {
      const all = d.customers.effyDriver + d.customers.courier
      return all ? `${Math.round((d.customers.returning / all) * 100)}% from returning customers` : "Returning customers show once you sell"
    },
    mini: (d) => (
      <span className="grid h-full content-center gap-2">
        <span className="flex h-3 gap-0.5">
          <i className="block rounded-l-[3px] bg-primary-fill" style={{ flex: d.customers.effyDriver || 1 }} />
          <i className="block rounded-r-[3px] bg-muted-foreground" style={{ flex: d.customers.courier || 1 }} />
        </span>
        <small className="flex justify-between text-[12.5px] text-muted-foreground">
          <span>{DELIVERED_BY_WORDS.effy_driver} {d.customers.effyDriver}</span>
          <span>{DELIVERED_BY_WORDS.courier} {d.customers.courier}</span>
        </small>
      </span>
    ),
    full: (d) => {
      const all = d.customers.effyDriver + d.customers.courier
      return (
        <>
          <div aria-hidden="true" className="mb-2.5 flex h-4 gap-0.5">
            <i className="block rounded-l-[3px] bg-primary-fill" style={{ flex: d.customers.effyDriver || 1 }} />
            <i className="block rounded-r-[3px] bg-muted-foreground" style={{ flex: d.customers.courier || 1 }} />
          </div>
          <ul className="border-t text-sm">
            <li className="flex justify-between border-b py-2.5">
              <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-primary-fill" />{DELIVERED_BY_WORDS.effy_driver}</span>
              <b className="font-medium tabular-nums">{plural(d.customers.effyDriver, "order")}</b>
            </li>
            <li className="flex justify-between border-b py-2.5">
              <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-muted-foreground" />{DELIVERED_BY_WORDS.courier}</span>
              <b className="font-medium tabular-nums">{plural(d.customers.courier, "order")}</b>
            </li>
            <li className="flex justify-between border-b py-2.5">
              <span>
                From people who bought from you before
                <small className="block text-[12.5px] text-muted-foreground">Counted on your goods only, never named</small>
              </span>
              <b className="font-medium tabular-nums">{all ? `${Math.round((d.customers.returning / all) * 100)}%` : "-"}</b>
            </li>
          </ul>
        </>
      )
    },
    table: (d) => ({
      head: ["", "Orders"],
      rows: [
        [DELIVERED_BY_WORDS.effy_driver, d.customers.effyDriver],
        [DELIVERED_BY_WORDS.courier, d.customers.courier],
        ["From people who bought from you before", d.customers.returning],
      ],
    }),
    how: "Who takes an order, in your two words: Effy driver or Courier. A returning customer had bought your goods before; you are never told who.",
  },
  {
    slug: "found-rate",
    page: "service",
    label: "Found rate",
    title: "Found rate over time",
    finding: (d) => (d.quality.foundRate ? `${d.quality.foundRate.value}% found` : "Nothing finished yet"),
    sub: (d) => `Each ${d.series.grain}, ${RANGE_IN[d.range]}`,
    measure: { value: (d) => (d.quality.foundRate ? `${d.quality.foundRate.value}%` : "-"), figure: (d) => d.quality.foundRate, unit: " pts", goodWhenUp: true },
    mini: (d) => <Spark values={d.series.buckets.map((b) => (b.foundRate === null ? null : Number(b.foundRate)))} label="Found rate over the period" />,
    full: (d) => rateLine((b) => (b.foundRate === null ? null : Number(b.foundRate)), d, pct1, "Found rate over the period"),
    table: (d) => ({ head: ["When", "Found rate"], rows: d.series.buckets.map((b, i) => [bucketLabels(d)[i]!, b.foundRate === null ? "-" : `${b.foundRate}%`]) }),
    how: "Items you packed out of items ordered, over the orders you finished.",
  },
  {
    slug: "cant-supply",
    page: "service",
    label: "Couldn’t supply",
    title: "Couldn’t supply over time",
    finding: (d) => (d.quality.cantSupplyRate ? `${d.quality.cantSupplyRate.value}% couldn’t be supplied` : "Nothing finished yet"),
    sub: (d) => `Each ${d.series.grain}, ${RANGE_IN[d.range]}`,
    measure: { value: (d) => (d.quality.cantSupplyRate ? `${d.quality.cantSupplyRate.value}%` : "-"), figure: (d) => d.quality.cantSupplyRate, unit: " pts", goodWhenUp: false },
    mini: (d) => <Spark values={d.series.buckets.map((b) => (b.cantSupplyRate === null ? null : Number(b.cantSupplyRate)))} label="Couldn’t supply over the period" />,
    full: (d) => rateLine((b) => (b.cantSupplyRate === null ? null : Number(b.cantSupplyRate)), d, pct1, "Couldn’t supply over the period"),
    table: (d) => ({ head: ["When", "Couldn’t supply"], rows: d.series.buckets.map((b, i) => [bucketLabels(d)[i]!, b.cantSupplyRate === null ? "-" : `${b.cantSupplyRate}%`]) }),
    how: "Orders you couldn’t supply in full, out of the orders you finished. What they were is on the Service page.",
  },
  {
    slug: "time-to-ready",
    page: "service",
    label: "Time to ready",
    title: "Time to ready over time",
    finding: (d) => (d.quality.averageTimeToReady ? `${minutes(d.quality.averageTimeToReady.value)} on average` : "Nothing finished yet"),
    sub: (d) => `Each ${d.series.grain}, ${RANGE_IN[d.range]}`,
    measure: { value: (d) => (d.quality.averageTimeToReady ? minutes(d.quality.averageTimeToReady.value) : "-"), figure: (d) => d.quality.averageTimeToReady, unit: "%", goodWhenUp: false },
    mini: (d) => <Spark values={d.series.buckets.map((b) => b.averageTimeToReady)} label="Time to ready over the period" />,
    full: (d) => rateLine((b) => b.averageTimeToReady, d, (n) => minutes(String(n)), "Time to ready over the period"),
    table: (d) => ({ head: ["When", "Time to ready"], rows: d.series.buckets.map((b, i) => [bucketLabels(d)[i]!, b.averageTimeToReady === null ? "-" : minutes(String(b.averageTimeToReady))]) }),
    how: "Average minutes from the customer paying to the order being marked ready.",
  },
  {
    slug: "ready-for-each-driver",
    page: "service",
    label: "Ready for each driver",
    title: "Ready for each driver",
    finding: (d) => {
      const w = worstRun(d.runs)
      return w ? `The ${timeWords(w.time)} driver is the one you miss most` : d.runs.length ? "Every order was ready for its driver" : "No driver came yet"
    },
    sub: (d) => {
      const w = worstRun(d.runs)
      return w ? `${plural(w.due - w.ready, "order")} not ready for it` : `${plural(d.runs.length, "run")}, ${RANGE_IN[d.range]}`
    },
    measure: {
      value: (d) => (d.quality.readyBeforeDriver ? `${Math.round(Number(d.quality.readyBeforeDriver.value))}%` : "-"),
      figure: (d) => d.quality.readyBeforeDriver,
      unit: " pts",
      goodWhenUp: true,
    },
    mini: (d) => (
      <span className="grid h-full content-center gap-[5px]">
        {d.runs.slice(0, 6).map((r) => (
          <span key={r.time} className="flex h-[9px] gap-px overflow-hidden rounded-[2px]">
            <i className="block" style={{ flex: r.ready || 0.01, background: "var(--pkg-at-hub)" }} />
            {r.due > r.ready ? <i className="block" style={{ flex: r.due - r.ready, background: "var(--pkg-problem)" }} /> : null}
          </span>
        ))}
      </span>
    ),
    full: (d) => <RunsList d={d} />,
    table: (d) => ({
      head: ["Run", "Ready in time", "Orders", "Share"],
      rows: d.runs.map((r) => [timeWords(r.time), r.ready, r.due, `${Math.round((r.ready / Math.max(1, r.due)) * 100)}%`]),
    }),
    how: "For each Effy collection run, the orders its driver came for and how many were packed and ready when it came. One that wasn’t goes on a later run.",
  },
  {
    slug: "slowest",
    page: "service",
    label: "When you’re slowest",
    title: "When you’re slowest",
    finding: (d) => {
      const { hours, values } = readyHours(d)
      const i = hiOf(values)
      return i < 0 ? "Nothing finished yet" : `Orders ready around ${hourWords(hours[i]!)} took ${values[i]} min`
    },
    sub: (d) => (d.quality.averageTimeToReady ? `Your average is ${minutes(d.quality.averageTimeToReady.value)}` : "Nothing finished yet"),
    mini: (d) => {
      const { values } = readyHours(d)
      return <MiniBars values={values} hi={hiOf(values)} />
    },
    full: (d) => {
      const { hours, values } = readyHours(d)
      if (hours.length === 0) return <p className="text-sm text-muted-foreground">Nothing finished in this period yet.</p>
      return <Columns values={values} labels={hours.map((h, i) => (i % 2 === 0 ? hourWords(h).replace(" ", "") : ""))} hi={hiOf(values)} label="Minutes to ready by hour" axis="Hour the order was ready" />
    },
    table: (d) => ({ head: ["Hour", "Minutes to ready", "Orders"], rows: d.readyByHour.map((r) => [hourWords(r.hour), Math.round(r.seconds / 60), r.orders]) }),
    how: "Average minutes from paid to ready, by the hour the order became ready.",
  },
  {
    slug: "how-long",
    page: "service",
    label: "How long orders take",
    title: "How long orders take to get ready",
    finding: (d) => (d.quality.readySpread.some((n) => n > 0) ? spreadSentence(d.quality.readySpread).replace(".", "") : "Nothing finished yet"),
    sub: (d) => `${plural(d.quality.readySpread.reduce((n, x) => n + x, 0), "order")} finished`,
    mini: (d) => <MiniBars values={d.quality.readySpread} hi={hiOf(d.quality.readySpread)} />,
    full: (d) => <Columns values={d.quality.readySpread} labels={READY_SPREAD_LABELS} hi={hiOf(d.quality.readySpread)} label="Orders by minutes to ready" axis="Minutes from paid to ready" />,
    table: (d) => ({ head: ["Minutes from paid to ready", "Orders"], rows: d.quality.readySpread.map((n, i) => [READY_SPREAD_LABELS[i]!, n]) }),
    how: "Orders you finished, by how long they took from paid to ready.",
  },
]

export const chartOf = (slug: string) => CHARTS.find((c) => c.slug === slug) ?? null

/** A card: what the chart found, a glimpse of it, and where it opens. */
export function ChartCard({ chart, dto, search }: { chart: ChartDef; dto: Dto; search: Record<string, string> }) {
  return (
    <Link
      to="/insights/$section/$chart"
      params={{ section: chart.page, chart: chart.slug }}
      search={search as never}
      className="grid min-w-0 grid-rows-[auto_auto_1fr_auto] gap-1.5 rounded-lg border bg-background px-4 pt-4 pb-3 no-underline transition-colors hover:border-[color-mix(in_srgb,var(--foreground)_22%,var(--border))] hover:bg-row-hover [&:hover_.ef-card-arrow]:translate-x-[3px]"
    >
      <span className="text-[13px] font-medium text-muted-foreground">{chart.label}</span>
      {chart.measure ? (
        <span className="grid gap-0.5">
          <b className="text-[30px] leading-9 font-semibold tracking-[-0.03em] tabular-nums">{chart.measure.value(dto)}</b>
          <Delta figure={chart.measure.figure(dto)} unit={chart.measure.unit} goodWhenUp={chart.measure.goodWhenUp} label={`on ${dto.briefing.comparedWith}`} small />
        </span>
      ) : (
        <b className="min-h-[42px] text-[15px] leading-[21px] font-semibold tracking-[-0.01em] text-pretty">{chart.finding(dto)}</b>
      )}
      <span aria-hidden="true" className="mt-2 block h-[76px] min-w-0">
        {chart.mini(dto)}
      </span>
      <span className="mt-1.5 flex items-center justify-between gap-2 border-t pt-2.5 text-[13px] text-muted-foreground">
        <span className="truncate">{chart.sub(dto)}</span>
        <ArrowRight aria-hidden="true" className="ef-card-arrow size-[15px] flex-none transition-transform" />
      </span>
    </Link>
  )
}

/** A card that opens another Insights page rather than a chart. */
export function PageCard({ to, search, label, finding, sub, children }: { to: keyof typeof PAGE_PATH; search: Record<string, string>; label: string; finding: string; sub: string; children: ReactNode }) {
  return (
    <Link
      to={PAGE_PATH[to]}
      search={search as never}
      className="grid min-w-0 grid-rows-[auto_auto_1fr_auto] gap-1.5 rounded-lg border bg-background px-4 pt-4 pb-3 no-underline transition-colors hover:border-[color-mix(in_srgb,var(--foreground)_22%,var(--border))] hover:bg-row-hover [&:hover_.ef-card-arrow]:translate-x-[3px]"
    >
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
      <b className="min-h-[42px] text-[15px] leading-[21px] font-semibold tracking-[-0.01em] text-pretty">{finding}</b>
      <span aria-hidden="true" className="mt-2 block h-[76px] min-w-0">
        {children}
      </span>
      <span className="mt-1.5 flex items-center justify-between gap-2 border-t pt-2.5 text-[13px] text-muted-foreground">
        <span className="truncate">{sub}</span>
        <ArrowRight aria-hidden="true" className="ef-card-arrow size-[15px] flex-none transition-transform" />
      </span>
    </Link>
  )
}

export { MiniBarsH }
