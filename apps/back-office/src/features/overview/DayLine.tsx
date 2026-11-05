import { useState, type CSSProperties } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowRight, ChartNoAxesGantt, Check, CircleSlash, Clock, Table2 } from "lucide-react"

import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui"
import type { FleetOverviewDTO } from "@effy/shared-types"
import { PackageStatusPill } from "@effy/web-kit/console"
import { Bone, Loading, StatusWord } from "@effy/web-kit/patterns"

import { slotGridQuery } from "@/features/delivery/queries"
import { dispatchWindowsQuery } from "@/features/dispatch/queries"

import { ageWords, axisOf, clockWords, localHours, plural, spanWords, windowLines, type WindowLine } from "./model"
import { at12 } from "./overviewFormat"
import { CouldNotLoad, Section } from "./Section"

const SEGMENTS = [
  ["delivered", "Delivered", "--pkg-delivered"],
  ["out", "Out for delivery", "--pkg-out"],
  ["atHub", "At hub", "--pkg-at-hub"],
  ["earlier", "Not at the hub yet", "--pkg-earlier"],
  ["problem", "Problem", "--pkg-problem"],
] as const

/** Today and the next delivery days, every window on one shared clock. */
export function DayLine({ now, runs }: { now: number; runs: FleetOverviewDTO | undefined }) {
  const [date, setDate] = useState<string | null>(null)
  const [asTable, setAsTable] = useState(false)
  const grid = useQuery(slotGridQuery())
  const todayWindows = useQuery(dispatchWindowsQuery(null))
  const chosen = useQuery({ ...dispatchWindowsQuery(date), enabled: date !== null })
  const days = todayWindows.data?.days ?? []
  const day = days.find((d) => d.date === (date ?? todayWindows.data?.date)) ?? days[0]
  const isToday = date === null
  const windows = isToday ? todayWindows : chosen

  const nowH = localHours(now)
  const lines =
    grid.data && windows.data && day
      ? windowLines({ slots: grid.data.items, windows: windows.data.windows, date: day.date, isToday, now })
      : null
  const failed = grid.isError || windows.isError
  const total = lines?.reduce((s, l) => s + l.booked, 0) ?? 0

  return (
    <Section
      id="ov-day-t"
      tour="overview.windows"
      order={2}
      className="ef-tl-host"
      title={isToday ? "Today’s delivery windows" : `Delivery windows, ${day?.label ?? ""}`}
      description={
        lines
          ? isToday
            ? `${plural(total, "booking")} across ${plural(lines.length, "window")}. Each bar is the window’s own hours; the tick before it is its order-by.`
            : `${plural(total, "booking")} so far. Rounds are planned on the day.`
          : undefined
      }
      actions={
        <>
          {days.length > 1 ? (
            <Tabs
              value={date ?? "today"}
              onValueChange={(v) => setDate(v === "today" ? null : v)}
              className="max-md:hidden"
            >
              <TabsList aria-label="Which day">
                {days.map((d) => (
                  <TabsTrigger key={d.date} value={d.isToday ? "today" : d.date}>
                    {d.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null}
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
            <Link to="/orders/assignments">
              All of today
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </>
      }
    >
      {failed ? (
        <CouldNotLoad what="the delivery windows" service="fleet service" />
      ) : !lines ? (
        <Loading label="Loading the delivery windows">
          <DayLineSkeleton />
        </Loading>
      ) : lines.length === 0 ? (
        <p className="border-t py-3.5 text-sm text-muted-foreground">
          No delivery windows are set up. Add them under Delivery › Delivery windows.
        </p>
      ) : asTable ? (
        <WindowsTable lines={lines} />
      ) : (
        <Plot lines={lines} isToday={isToday} nowH={nowH} runs={isToday ? runs : undefined} />
      )}
    </Section>
  )
}

function Plot({
  lines,
  isToday,
  nowH,
  runs,
}: {
  lines: readonly WindowLine[]
  isToday: boolean
  nowH: number
  runs: FleetOverviewDTO | undefined
}) {
  const [tip, setTip] = useState<{ line: WindowLine; x: number; y: number } | null>(null)
  const runHours = (runs?.runs ?? []).map((r) => ({ ...r, h: localHours(r.at) }))
  const { from, to, ticks } = axisOf(lines, isToday ? nowH : null)
  const pct = (h: number) => ((Math.min(Math.max(h, from), to) - from) / (to - from)) * 100
  const nextCut = isToday
    ? lines.filter((l) => l.cutoff !== null && l.cutoff > nowH).sort((a, b) => a.cutoff! - b.cutoff!)[0]
    : null
  const done = runHours.filter((r) => r.state === "done").length
  const nextRun = runHours.find((r) => r.state === "next")

  return (
    <>
      <div className="ef-tl" onPointerLeave={() => setTip(null)}>
        <div className="ef-tl__axis">
          <div className="text-[12.5px]">Window</div>
          <div className="ef-tl__hrs" aria-hidden="true">
            {ticks.map((h) => (
              <span
                key={h}
                style={{ left: `${pct(h)}%`, visibility: isToday && Math.abs(h - nowH) < 2 ? "hidden" : undefined }}
              >
                {clockWords(h)}
              </span>
            ))}
          </div>
          <div className="text-[12.5px]">Booked</div>
          <div className="ef-tl__col text-right text-[12.5px]">At hub</div>
          <div className="ef-tl__col text-[12.5px]">Round</div>
          <div className="text-right text-[12.5px]">State</div>
        </div>
        <div className="ef-tl__over" aria-hidden="true">
          {ticks.map((h) => (
            <i key={h} className="ef-tl__grid" style={{ left: `${pct(h)}%` }} />
          ))}
          {isToday && nowH >= from && nowH <= to ? (
            <>
              <i className="ef-tl__past" style={{ width: `${pct(nowH)}%` }} />
              <div className="ef-tl__now" style={{ left: `${pct(nowH)}%` }}>
                <b>{clockWords(nowH)}</b>
              </div>
            </>
          ) : null}
        </div>

        {isToday && runHours.length > 0 ? (
          <div className="ef-tl__row ef-tl__runs">
            <div>
              <b className="block font-medium whitespace-nowrap">Collection runs</b>
              <small className="block text-[12.5px] whitespace-nowrap text-muted-foreground">
                {nextRun ? `Next ${clockWords(nextRun.h)}` : "None left today"}
              </small>
            </div>
            <div className="ef-tl__plot">
              {runHours.map((r) => (
                <span
                  key={r.at}
                  className="ef-tl__run"
                  data-state={r.state}
                  style={{ left: `${pct(r.h)}%` }}
                  title={`${clockWords(r.h)} run · ${r.state === "done" ? "done" : r.state === "late" ? "not finished" : r.state === "next" ? "next" : "later"}`}
                >
                  {r.state === "done" ? <Check aria-hidden="true" className="size-2.5" strokeWidth={3.5} /> : null}
                </span>
              ))}
            </div>
            <div className="ef-tl__runs-word">
              {done} of {runHours.length} done
            </div>
          </div>
        ) : null}

        {lines.map((l) => (
          <WindowRow
            key={l.key}
            line={l}
            isToday={isToday}
            nowH={nowH}
            pct={pct}
            soon={nextCut === l}
            onTip={(x, y) => setTip(x === null ? null : { line: l, x, y: y! })}
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
          Order by
        </span>
        {isToday && runHours.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <i className="size-3 rounded-full bg-muted-foreground" />
            Collection run
          </span>
        ) : null}
      </div>
      {tip ? <WindowTip {...tip} /> : null}
    </>
  )
}

function WindowRow({
  line: l,
  isToday,
  nowH,
  pct,
  soon,
  onTip,
}: {
  line: WindowLine
  isToday: boolean
  nowH: number
  pct: (h: number) => number
  soon: boolean
  onTip: (x: number | null, y?: number) => void
}) {
  const left = pct(l.start)
  const width = Math.max(0.5, pct(l.end) - left)
  const segs = SEGMENTS.map(([k, , v]) => [l.counts[k], v] as const).filter(([n]) => n > 0)
  const roundWord = l.round
    ? `${l.round.driverName}${l.round.more ? ` +${l.round.more}` : ""}`
    : isToday
      ? "No round yet"
      : "Planned on the day"
  const opens =
    l.round?.opensAt && localHours(l.round.opensAt) > nowH && isToday ? `Opens ${at12(l.round.opensAt)}` : ""
  const late = l.lateMin !== null ? `${ageWords(l.lateMin)} past its window` : ""
  const capLeft = left + width / 2 < 52
  const span = spanWords(l.start, l.end)
  return (
    <Link
      to="/orders/assignments"
      className="ef-tl__row"
      aria-label={`${l.anyTime ? `Any time, ${span}` : span}: ${l.booked} booked${l.capacity !== null ? ` of ${l.capacity}` : ""}${late ? `, ${late}` : ""}`}
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
        <b className="block font-medium whitespace-nowrap tabular-nums">{l.anyTime ? "Any time" : span}</b>
        <small className="block text-[12.5px] whitespace-nowrap text-muted-foreground">
          {l.anyTime ? span : l.cutoffWords ? `Order by ${l.cutoffWords}` : ""}
        </small>
      </div>
      <div className="ef-tl__plot">
        {l.cutoff !== null ? (
          <>
            <span
              className="ef-tl__whisk"
              style={{ left: `${pct(l.cutoff)}%`, width: `${pct(l.start) - pct(l.cutoff)}%` }}
            />
            <span className="ef-tl__tick" data-soon={soon ? "" : undefined} style={{ left: `${pct(l.cutoff)}%` }} />
          </>
        ) : null}
        <span className="ef-tl__bar" style={{ left: `${left}%`, width: `${width}%` }}>
          {segs.length ? (
            segs.map(([n, v]) => <i key={v} style={{ flex: n, background: `var(${v})` } as CSSProperties} />)
          ) : (
            <i style={{ flex: 1, background: "var(--muted)" }} />
          )}
        </span>
        <span className="ef-tl__cap" style={capLeft ? { left: `${left}%` } : { right: `${100 - (left + width)}%` }}>
          {late ? <em className="font-medium text-destructive not-italic">{late} · </em> : null}
          {l.counts.atHub ? `${l.counts.atHub} at the hub · ` : ""}
          {roundWord}
          {opens ? ` · ${opens}` : ""}
        </span>
      </div>
      <div className="ef-tl__booked">
        <b className="block font-medium whitespace-nowrap tabular-nums">
          {l.booked}{" "}
          <small className="text-[12.5px] font-normal text-muted-foreground">
            {l.capacity !== null ? `of ${l.capacity}` : "no limit"}
          </small>
          {l.full ? <small className="ml-1 text-[12.5px] font-medium text-accent2">Full</small> : null}
        </b>
        {l.capacity !== null ? (
          <span className="mt-1.5 block h-1 overflow-hidden rounded-xs bg-muted">
            <i
              className={l.full ? "block h-full bg-accent2" : "block h-full bg-foreground"}
              style={{ width: `${Math.min(100, (l.booked / Math.max(1, l.capacity)) * 100)}%` }}
            />
          </span>
        ) : null}
      </div>
      <div className="ef-tl__col text-right tabular-nums">{l.counts.atHub}</div>
      <div className="ef-tl__col min-w-0">
        <span className="block truncate">{roundWord}</span>
        {late ? (
          <small className="block text-[12.5px] font-medium whitespace-nowrap text-destructive">{late}</small>
        ) : opens ? (
          <small className="block text-[12.5px] whitespace-nowrap text-muted-foreground">{opens}</small>
        ) : null}
      </div>
      <div className="ef-tl__state flex justify-end">
        <WindowState line={l} isToday={isToday} />
      </div>
    </Link>
  )
}

function WindowState({ line: l, isToday }: { line: WindowLine; isToday: boolean }) {
  if (isToday && l.state) return <PackageStatusPill view={l.state} showDetail={false} icons />
  if (l.full)
    return (
      <StatusWord tone="waiting" icon={CircleSlash}>
        Full
      </StatusWord>
    )
  return (
    <StatusWord tone="muted" icon={Clock}>
      Open
    </StatusWord>
  )
}

/** The breakdown behind a bar, on hover or keyboard focus. Every figure is also in the table view. */
function WindowTip({ line: l, x, y }: { line: WindowLine; x: number; y: number }) {
  const rows = SEGMENTS.map(([k, label, v]) => [label, l.counts[k], v] as const).filter(([, n]) => n > 0)
  const left = Math.min(x + 14, window.innerWidth - 200)
  const top = Math.min(y + 14, window.innerHeight - 180)
  return (
    <div className="ef-tip" style={{ left, top }} role="presentation">
      <b>{l.anyTime ? `Any time · ${spanWords(l.start, l.end)}` : spanWords(l.start, l.end)}</b>
      {rows.length ? (
        rows.map(([label, n, v]) => (
          <div key={v}>
            <i className="ef-sw" style={{ background: `var(${v})` }} />
            {label}
            <strong>{n}</strong>
          </div>
        ))
      ) : (
        <div>Nothing booked yet</div>
      )}
      <div className="ef-tip__foot">
        {l.cutoffWords ? `Order by ${l.cutoffWords}` : ""}
        {l.capacity !== null ? ` · limit ${l.capacity}` : " · no limit"}
      </div>
    </div>
  )
}

function WindowsTable({ lines }: { lines: readonly WindowLine[] }) {
  return (
    <div className="max-h-[360px] overflow-auto border-t">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Window</TableHead>
            <TableHead>Order by</TableHead>
            <TableHead numeric>Booked</TableHead>
            <TableHead numeric>Limit</TableHead>
            {SEGMENTS.map(([k, label]) => (
              <TableHead key={k} numeric>
                {label}
              </TableHead>
            ))}
            <TableHead>Round</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.key}>
              <TableCell className="whitespace-nowrap">
                {l.anyTime ? (
                  <>
                    Any time <Badge variant="outline">{spanWords(l.start, l.end)}</Badge>
                  </>
                ) : (
                  spanWords(l.start, l.end)
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap">{l.cutoffWords ?? "-"}</TableCell>
              <TableCell numeric>{l.booked}</TableCell>
              <TableCell numeric>{l.capacity ?? "None"}</TableCell>
              {SEGMENTS.map(([k]) => (
                <TableCell key={k} numeric>
                  {l.counts[k]}
                </TableCell>
              ))}
              <TableCell className="whitespace-nowrap">{l.round ? l.round.driverName : "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function DayLineSkeleton() {
  return (
    <div className="ef-tl">
      <div className="ef-tl__axis">
        <div className="text-[12.5px]">Window</div>
        <div className="ef-tl__hrs" />
        <div className="text-[12.5px]">Booked</div>
        <div className="ef-tl__col text-right text-[12.5px]">At hub</div>
        <div className="ef-tl__col text-[12.5px]">Round</div>
        <div className="text-right text-[12.5px]">State</div>
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="ef-tl__row">
          <div className="space-y-1.5">
            <Bone className="h-3 w-20" />
            <Bone className="h-3 w-16" />
          </div>
          <div className="ef-tl__plot">
            <Bone className="absolute top-1 h-3.5" style={{ left: `${10 + i * 14}%`, width: "14%" }} />
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
