import { useRef, useState, type KeyboardEvent } from "react"

import type { InsightsRhythmDTO } from "@effy/shared-types"

import { hourWords, rhythmGrid, WEEKDAY_NAME, WEEKDAY_SHORT } from "./model"

const STEPS = [12, 24, 36, 50, 64, 78, 90, 100]
/** One hue, light to dark, over the muted ground: the theme's own blue, in either appearance. */
export const shade = (step: number | null) =>
  step === null ? "var(--muted)" : `color-mix(in srgb, var(--primary-fill) ${STEPS[step]}%, var(--muted))`

interface Reading {
  weekday: number
  hour: number
  x: number
  y: number
}

/** When this shop's orders come in, across recent weeks. Every square says its numbers on hover or keyboard focus. */
export function Rhythm({ rhythm, compact = false }: { rhythm: InsightsRhythmDTO | null; compact?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const [reading, setReading] = useState<Reading | null>(null)
  if (!rhythm) {
    return <p className="text-sm text-muted-foreground">Your week’s rhythm appears here after two weeks of orders.</p>
  }
  const { hours, rows } = rhythmGrid(rhythm)
  const raw = new Map(rhythm.cells.map((c) => [`${c.weekday}-${c.hour}`, c.orders]))
  const avgHour = rhythm.cells.reduce((n, c) => n + c.orders, 0) / (7 * hours.length)

  function read(weekday: number, hour: number, el: HTMLElement) {
    const box = host.current?.getBoundingClientRect()
    const cell = el.getBoundingClientRect()
    if (!box) return
    setReading({ weekday, hour, x: cell.left - box.left + cell.width / 2, y: cell.top - box.top })
  }

  function keys(e: KeyboardEvent<HTMLButtonElement>, weekday: number, hour: number) {
    const move = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key]
    if (e.key === "Escape") setReading(null)
    if (!move) return
    e.preventDefault()
    const next = host.current?.querySelector<HTMLButtonElement>(`[data-wd="${weekday + move[0]!}"][data-hr="${hour + move[1]!}"]`)
    next?.focus()
  }

  const tip = reading
    ? (() => {
        const v = raw.get(`${reading.weekday}-${reading.hour}`) ?? 0
        const day = rhythm.cells.filter((c) => c.weekday === reading.weekday).reduce((n, c) => n + c.orders, 0)
        const dayHours = rhythm.cells.filter((c) => c.weekday === reading.weekday).map((c) => c.orders)
        const busiestHour = v > 0 && v === Math.max(...dayHours)
        const vs = avgHour > 0 ? Math.round(((v - avgHour) / avgHour) * 100) : 0
        const avg = v / rhythm.weeks
        return {
          title: `${WEEKDAY_NAME[reading.weekday]}, ${hourWords(reading.hour)} to ${hourWords((reading.hour + 1) % 24)}`,
          avg: avg % 1 ? avg.toFixed(1) : String(avg),
          total: v,
          share: day ? Math.round((v / day) * 100) : 0,
          foot: v === 0 ? "No orders in this hour" : busiestHour ? `${WEEKDAY_NAME[reading.weekday]}’s busiest hour` : `${Math.abs(vs)}% ${vs >= 0 ? "above" : "below"} your usual hour`,
        }
      })()
    : null

  return (
    <div ref={host} className="relative" onPointerLeave={() => setReading(null)}>
      <div
        role="group"
        aria-label="Orders by weekday and hour. Point at or tab to a square for its numbers; arrow keys move."
        className="grid items-center gap-0.5 max-md:gap-px"
        style={{ gridTemplateColumns: `36px repeat(${hours.length}, minmax(0, 1fr))` }}
      >
        <span />
        {hours.map((h, i) => (
          <span key={h} className="h-4.5 text-center text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {i % 3 === 0 ? hourWords(h).replace(" ", "") : ""}
          </span>
        ))}
        {rows.map((row) => (
          <div key={row.weekday} className="contents">
            <span className="text-xs text-muted-foreground">{WEEKDAY_SHORT[row.weekday]}</span>
            {row.cells.map((c) => (
              <button
                key={c.hour}
                type="button"
                data-wd={row.weekday}
                data-hr={c.hour}
                aria-label={`${WEEKDAY_NAME[row.weekday]}, ${hourWords(c.hour)}: ${c.average} ${c.average === "1" ? "order" : "orders"} on average`}
                style={{ background: shade(c.step) }}
                className={`w-full min-w-0 cursor-default rounded-[4px] border-0 p-0 hover:outline-2 hover:outline-foreground focus-visible:outline-2 focus-visible:outline-foreground max-md:rounded-[2px] ${compact ? "aspect-[1.5]" : "h-10 max-md:h-[22px]"}`}
                onPointerEnter={(e) => read(row.weekday, c.hour, e.currentTarget)}
                onFocus={(e) => read(row.weekday, c.hour, e.currentTarget)}
                onBlur={() => setReading(null)}
                onKeyDown={(e) => keys(e, row.weekday, c.hour)}
              />
            ))}
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-3 flex flex-wrap items-center gap-0.5 text-xs text-muted-foreground">
        <span className="mr-1.5">Fewer</span>
        {STEPS.map((_, i) => (
          <i key={i} className="h-2.5 w-5.5 rounded-[2px]" style={{ background: shade(i) }} />
        ))}
        <span className="ml-1.5">More orders</span>
        <span className="ml-auto">Average of the last {rhythm.weeks} weeks</span>
      </div>
      {tip && reading ? (
        <div
          role="status"
          className="ef-tip pointer-events-none"
          style={{ position: "absolute", left: Math.max(0, reading.x - 110), top: reading.y > 150 ? reading.y - 142 : reading.y + 52 }}
        >
          <b>{tip.title}</b>
          <div>
            <i className="ef-sw" style={{ background: "var(--primary-fill)" }} />
            Orders on average
            <strong>{tip.avg}</strong>
          </div>
          <div>
            Orders in {rhythm.weeks} weeks<strong>{tip.total}</strong>
          </div>
          <div>
            Share of {WEEKDAY_NAME[reading.weekday]}’s orders<strong>{tip.share}%</strong>
          </div>
          <div className="ef-tip__foot">{tip.foot}</div>
        </div>
      ) : null}
    </div>
  )
}
