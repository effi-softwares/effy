import { useState, type CSSProperties } from "react"

import { Link } from "@tanstack/react-router"
import { ArrowRight, Check, ChartNoAxesGantt, CircleAlert, Clock, Package, Table2 } from "lucide-react"

import { Button } from "@effy/design-system/ui"
import type { ShopTodayDTO, ShopTodayRunDTO } from "@effy/shared-types"
import { StaticTable } from "@effy/web-kit/data-table"
import { Bone, Loading, StatusWord, type StatusTone } from "@effy/web-kit/patterns"

import { BoardSection } from "@/components/console/BoardSection"

import { clock, clockWords, dayAxis, driverWords, hoursOf, minutesUntil, nextRun, plural, runPacked, runState, runTotal, untilWords } from "./model"

/** How far each order on a run is, in the board's package colours: grey until packed, blue ready, green gone. */
const SEGMENTS = [
  ["collected", "Collected", "--pkg-delivered"],
  ["ready", "Ready", "--pkg-at-hub"],
  ["picking", "Being picked", "--pkg-with-driver"],
  ["waiting", "Not started", "--pkg-preparing"],
] as const

const STATE_TONE: Record<ReturnType<typeof runState>["tone"], StatusTone> = {
  bad: "problem",
  good: "done",
  info: "moving",
  warn: "waiting",
  quiet: "quiet",
}
const STATE_ICON = { bad: CircleAlert, good: Check, info: Package, warn: Clock, quiet: Clock } as const

/** Today's Effy drivers, each run on one shared clock: a bar from its first order to the time it comes. */
export function RunLine({ today, now }: { today: ShopTodayDTO | undefined; now: number }) {
  const [asTable, setAsTable] = useState(false)
  return (
    <BoardSection
      id="td-runs-t"
      tour="today.collection"
      order={2}
      className="ef-tl-host"
      title="Today’s Effy drivers"
      description={
        today && today.runs.length > 0
          ? "Each bar runs from the first order for that driver to the time it comes, split by how far each order is."
          : undefined
      }
      actions={
        <>
          <Button
            variant="ghost"
            size="icon"
            className="max-md:hidden"
            aria-label={asTable ? "Show as a timeline" : "Show as a table"}
            title={asTable ? "Show as a timeline" : "Show as a table"}
            aria-pressed={asTable}
            onClick={() => setAsTable(!asTable)}
          >
            {asTable ? <ChartNoAxesGantt aria-hidden="true" /> : <Table2 aria-hidden="true" />}
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/orders">
              All orders
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </>
      }
    >
      {!today ? (
        <Loading label="Loading today’s drivers">
          <RunLineSkeleton />
        </Loading>
      ) : today.runs.length === 0 ? (
        <p className="border-t py-3.5 text-sm text-muted-foreground">No Effy collection runs are set up today.</p>
      ) : asTable ? (
        <RunsTable today={today} />
      ) : (
        <Plot today={today} now={now} />
      )}
    </BoardSection>
  )
}

function Plot({ today, now }: { today: ShopTodayDTO; now: number }) {
  const [tip, setTip] = useState<{ run: ShopTodayRunDTO; x: number; y: number } | null>(null)
  const tz = today.timezone
  const nowH = hoursOf(now, tz)
  const { from, to, ticks } = dayAxis(today, now)
  const pct = (h: number) => ((Math.min(Math.max(h, from), to) - from) / (to - from)) * 100
  const next = nextRun(today, now)
  const pickups = today.courierPickups.filter((p) => p.from)
  return (
    <>
      <div className="ef-tl" onPointerLeave={() => setTip(null)}>
        <div className="ef-tl__axis">
          <div className="text-[12.5px]">Run</div>
          <div className="ef-tl__hrs" aria-hidden="true">
            {ticks.map((h) => (
              <span key={h} style={{ left: `${pct(h)}%`, visibility: Math.abs(h - nowH) < 1.6 ? "hidden" : undefined }}>
                {clockWords(h)}
              </span>
            ))}
          </div>
          <div className="text-[12.5px]">Ready</div>
          <div className="ef-tl__col text-right text-[12.5px]">Orders</div>
          <div className="ef-tl__col text-[12.5px]">Driver</div>
          <div className="text-right text-[12.5px]">State</div>
        </div>
        <div className="ef-tl__over" aria-hidden="true">
          {ticks.map((h) => (
            <i key={h} className="ef-tl__grid" style={{ left: `${pct(h)}%` }} />
          ))}
          {nowH >= from && nowH <= to ? (
            <>
              <i className="ef-tl__past" style={{ width: `${pct(nowH)}%` }} />
              <div className="ef-tl__now" style={{ left: `${pct(nowH)}%` }}>
                <b>{clockWords(nowH)}</b>
              </div>
            </>
          ) : null}
        </div>

        {pickups.length > 0 ? (
          <div className="ef-tl__row ef-tl__runs">
            <div>
              <b className="block font-medium whitespace-nowrap">Courier pickups</b>
              <small className="block text-[12.5px] whitespace-nowrap text-muted-foreground">
                {plural(pickups.reduce((n, p) => n + p.parcels, 0), "parcel")}
              </small>
            </div>
            <div className="ef-tl__plot">
              {pickups.map((p) => {
                const done = p.handedOver >= p.parcels
                return (
                  <span
                    key={`${p.from}-${p.courierName ?? ""}`}
                    className="ef-tl__run"
                    data-state={done ? "done" : new Date(p.from!).getTime() > now ? "next" : "late"}
                    style={{ left: `${pct(hoursOf(p.from!, tz))}%` }}
                    title={`${p.courierName ?? "Courier"} at ${clock(p.from!, tz)} · ${plural(p.parcels, "parcel")}${done ? " · handed over" : ""}`}
                  >
                    {done ? <Check aria-hidden="true" className="size-2.5" strokeWidth={3.5} /> : null}
                  </span>
                )
              })}
            </div>
            <div className="ef-tl__runs-word">
              {pickups.map((p) => `${p.courierName ?? "Courier"} ${clock(p.from!, tz)}`).join(" · ")}
            </div>
          </div>
        ) : null}

        {today.runs.map((r) => (
          <RunRow
            key={r.runAt}
            run={r}
            next={next}
            now={now}
            timezone={tz}
            pct={pct}
            onTip={(x, y) => setTip(x === null ? null : { run: r, x, y: y! })}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 border-t px-2 pt-2.5 text-[12.5px] text-muted-foreground">
        {SEGMENTS.map(([, label, v]) => (
          <span key={v} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <i className="ef-sw" style={{ background: `var(${v})` }} />
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <i className="h-3 w-0.5 rounded-[1px] bg-muted-foreground" />
          Driver comes
        </span>
        {pickups.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <i className="size-3 rounded-full border-[1.5px] border-muted-foreground" />
            Courier pickup
          </span>
        ) : null}
      </div>
      {tip ? <RunTip {...tip} timezone={tz} /> : null}
    </>
  )
}

function RunRow({
  run: r,
  next,
  now,
  timezone,
  pct,
  onTip,
}: {
  run: ShopTodayRunDTO
  next: ShopTodayRunDTO | null
  now: number
  timezone: string
  pct: (h: number) => number
  onTip: (x: number | null, y?: number) => void
}) {
  const total = runTotal(r)
  const packed = runPacked(r)
  const runH = hoursOf(r.runAt, timezone)
  const startH = r.firstPaidAt ? hoursOf(r.firstPaidAt, timezone) : runH - 1
  const left = pct(Math.min(startH, runH))
  const width = Math.max(0.8, pct(runH) - left)
  const segs = SEGMENTS.map(([k, , v]) => [r[k], v] as const).filter(([n]) => n > 0)
  const state = runState(r, next, now)
  const Icon = STATE_ICON[state.tone]
  const driver = driverWords(r, next, timezone)
  const isPast = new Date(r.runAt).getTime() <= now || r.driver === "collected"
  const when = r === next ? `in ${untilWords(minutesUntil(r.runAt, now))}` : isPast ? "Earlier today" : "Effy driver"
  const capLeft = left + width / 2 < 52
  return (
    <Link
      to="/orders"
      className="ef-tl__row"
      aria-label={`${clock(r.runAt, timezone)} Effy driver: ${plural(total, "order")}, ${packed} ready, ${state.word}${r.missed ? `, ${r.missed} not ready when it came` : ""}`}
      onPointerMove={(e) => {
        const plot = (e.target as HTMLElement).closest(".ef-tl__plot")
        if (plot) onTip(e.clientX, e.clientY)
        else onTip(null)
      }}
      onFocus={(e) => {
        const b = e.currentTarget.querySelector(".ef-tl__plot")?.getBoundingClientRect()
        if (b) onTip(b.left + b.width / 2, b.bottom)
      }}
      onBlur={() => onTip(null)}
    >
      <div>
        <b className="block font-medium whitespace-nowrap tabular-nums">{clock(r.runAt, timezone)} driver</b>
        <small className="block text-[12.5px] whitespace-nowrap text-muted-foreground">{when}</small>
      </div>
      <div className="ef-tl__plot">
        <span className="ef-tl__bar" style={{ left: `${left}%`, width: `${width}%` }}>
          {segs.length ? (
            segs.map(([n, v]) => <i key={v} style={{ flex: n, background: `var(${v})` } as CSSProperties} />)
          ) : (
            <i style={{ flex: 1, background: "var(--muted)" }} />
          )}
        </span>
        <span className="ef-tl__tick" data-soon={r === next ? "" : undefined} style={{ left: `${pct(runH)}%` }} />
        <span className="ef-tl__cap" style={capLeft ? { left: `${left}%` } : { right: `${100 - (left + width)}%` }}>
          {r.missed ? <em className="font-medium text-destructive not-italic">{r.missed} not ready · </em> : null}
          {total ? `${packed} of ${total} ready` : "No orders yet"} · {driver}
        </span>
      </div>
      <div className="ef-tl__booked">
        <b className="block font-medium whitespace-nowrap tabular-nums">
          {packed} <small className="text-[12.5px] font-normal text-muted-foreground">of {total} ready</small>
        </b>
        {total ? (
          <span className="mt-1.5 block h-1 overflow-hidden rounded-xs bg-muted">
            <i className={packed === total ? "block h-full bg-primary-fill" : "block h-full bg-foreground"} style={{ width: `${(packed / total) * 100}%` }} />
          </span>
        ) : null}
      </div>
      <div className="ef-tl__col text-right tabular-nums">{total}</div>
      <div className="ef-tl__col min-w-0">
        <span className="block truncate">{driver}</span>
      </div>
      <div className="ef-tl__state flex justify-end">
        <StatusWord tone={STATE_TONE[state.tone]} icon={Icon}>
          {state.word}
        </StatusWord>
      </div>
    </Link>
  )
}

/** What is behind a bar, on hover or keyboard focus. Every figure is also in the table view. */
function RunTip({ run: r, x, y, timezone }: { run: ShopTodayRunDTO; x: number; y: number; timezone: string }) {
  const rows = SEGMENTS.map(([k, label, v]) => [label, r[k], v] as const).filter(([, n]) => n > 0)
  const left = Math.min(x + 14, window.innerWidth - 220)
  const top = Math.min(y + 14, window.innerHeight - 200)
  return (
    <div className="ef-tip" style={{ left, top }} role="presentation">
      <b>{clock(r.runAt, timezone)} Effy driver</b>
      {rows.length ? (
        rows.map(([label, n, v]) => (
          <div key={v}>
            <i className="ef-sw" style={{ background: `var(${v})` }} />
            {label}
            <strong>{n}</strong>
          </div>
        ))
      ) : (
        <div>No orders on this run yet</div>
      )}
      {r.missed ? (
        <div>
          <i className="ef-sw" style={{ background: "var(--pkg-problem)" }} />
          Not ready when it came
          <strong>{r.missed}</strong>
        </div>
      ) : null}
      <div className="ef-tip__foot">{r.collectedAt ? `Collected ${clock(r.collectedAt, timezone)}` : `Comes at ${clock(r.runAt, timezone)}`}</div>
    </div>
  )
}

function RunsTable({ today }: { today: ShopTodayDTO }) {
  const rows = today.runs.map((r) => ({ ...r, total: runTotal(r) }))
  return (
    <StaticTable
      label="Today’s Effy drivers"
      rows={rows}
      getRowId={(r) => r.runAt}
      columns={[
        { id: "run", header: "Driver", cell: ({ row }) => clock(row.original.runAt, today.timezone) },
        { id: "total", header: "Orders", accessorFn: (r) => r.total },
        { id: "collected", header: "Collected", accessorFn: (r) => r.collected },
        { id: "ready", header: "Ready", accessorFn: (r) => r.ready },
        { id: "picking", header: "Being picked", accessorFn: (r) => r.picking },
        { id: "waiting", header: "Not started", accessorFn: (r) => r.waiting },
        { id: "missed", header: "Not ready when it came", accessorFn: (r) => r.missed },
      ]}
    />
  )
}

function RunLineSkeleton() {
  return (
    <div className="ef-tl">
      <div className="ef-tl__axis">
        <div className="text-[12.5px]">Run</div>
        <div className="ef-tl__hrs" />
        <div className="text-[12.5px]">Ready</div>
        <div className="ef-tl__col text-right text-[12.5px]">Orders</div>
        <div className="ef-tl__col text-[12.5px]">Driver</div>
        <div className="text-right text-[12.5px]">State</div>
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="ef-tl__row">
          <div className="space-y-1.5">
            <Bone className="h-3 w-20" />
            <Bone className="h-3 w-16" />
          </div>
          <div className="ef-tl__plot">
            <Bone className="absolute top-1 h-3.5" style={{ left: `${6 + i * 15}%`, width: "13%" }} />
          </div>
          <div className="ef-tl__booked">
            <Bone className="h-3 w-12" />
          </div>
          <div className="ef-tl__col" />
          <div className="ef-tl__col" />
          <div className="ef-tl__state flex justify-end">
            <Bone className="h-6 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}
