import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"

import { m, useReducedMotion } from "motion/react"

export interface LineChartProps {
  labels: readonly string[]
  current: readonly (number | null)[]
  /** The comparison, dashed and grey: context, never a second subject. */
  previous?: readonly (number | null)[]
  format: (n: number) => string
  /** What the two lines are called. */
  names: readonly [string, string?]
  /** A small trend: no axes, no end labels. */
  compact?: boolean
  label: string
  className?: string
}

const AXIS = { top: 10, right: 92, bottom: 22, left: 52 }
const BARE = { top: 8, right: 8, bottom: 8, left: 8 }

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const watch = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width))
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  return { ref, width }
}

/** A round top for the axis: four equal steps of 1, 2, 2.5 or 5 at the data's scale. */
export function axisStep(top: number): number {
  if (top <= 0) return 1
  const size = 10 ** Math.floor(Math.log10(top / 4))
  return [1, 2, 2.5, 5, 10].map((k) => k * size).find((k) => k * 4 >= top)!
}

const pathOf = (values: readonly (number | null)[], x: (i: number) => number, y: (v: number) => number) => {
  let d = ""
  values.forEach((v, i) => {
    if (v === null) return
    d += `${i === 0 || values[i - 1] === null ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
  })
  return d.trim()
}

/**
 * One axis, one thin line, the comparison dashed behind it. A crosshair and a readout on hover, the same from the
 * arrow keys; the table view beside it carries every value for anyone who cannot use either.
 */
export function LineChart({ labels, current, previous, format, names, compact = false, label, className }: LineChartProps) {
  const { ref, width } = useWidth()
  const calm = useReducedMotion()
  const [at, setAt] = useState<number | null>(null)
  const height = compact ? 120 : 280

  const shape = useMemo(() => {
    const m = compact ? BARE : AXIS
    const all = [...current, ...(previous ?? [])].filter((v): v is number => v !== null)
    const top = Math.max(0, ...all)
    const step = axisStep(top)
    const max = compact ? top * 1.04 || 1 : step * 4
    const min = compact ? Math.min(...all, top) * 0.96 : 0
    const span = max - min || 1
    const x = (i: number) => m.left + (i / Math.max(labels.length - 1, 1)) * (width - m.left - m.right)
    const y = (v: number) => m.top + (1 - (v - min) / span) * (height - m.top - m.bottom)
    return { m, x, y, ticks: compact ? [] : [0, 1, 2, 3, 4].map((k) => k * step) }
  }, [compact, current, previous, labels.length, width, height])

  const { m: margin, x, y, ticks } = shape
  const every = Math.max(1, Math.ceil(labels.length / (width < 520 ? 5 : 9)))
  const last = current.reduce<number>((end, v, i) => (v === null ? end : i), -1)
  const lastPrev = previous ? previous.reduce<number>((end, v, i) => (v === null ? end : i), -1) : -1
  const end = last >= 0 ? current[last]! : null
  const endPrev = lastPrev >= 0 ? previous![lastPrev]! : null
  // Two end labels never sit on each other: the higher line's goes up, the other's down.
  const close = end !== null && endPrev !== null && last === lastPrev && Math.abs(y(end) - y(endPrev)) < 16
  const lift = close && end >= endPrev! ? -6 : close ? 14 : 4
  const drop = close && end! >= endPrev! ? 14 : close ? -6 : 4

  function pointAt(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const share = (e.clientX - box.left - margin.left) / Math.max(width - margin.left - margin.right, 1)
    setAt(Math.min(labels.length - 1, Math.max(0, Math.round(share * (labels.length - 1)))))
  }

  function keys(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === "ArrowRight") setAt((i) => Math.min((i ?? last) + 1, labels.length - 1))
    if (e.key === "ArrowLeft") setAt((i) => Math.max((i ?? last) - 1, 0))
    if (e.key === "Escape") setAt(null)
  }

  const shown = at === null ? null : { i: at, now: current[at] ?? null, then: previous?.[at] ?? null }
  const left = shown ? Math.min(Math.max(x(shown.i) - 80, 0), Math.max(width - 168, 0)) : 0

  return (
    <div ref={ref} className={`relative touch-pan-y ${className ?? ""}`} style={{ height }}>
      <svg
        role="img"
        aria-label={label}
        tabIndex={0}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block overflow-visible outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring"
        onPointerMove={pointAt}
        onPointerLeave={() => setAt(null)}
        onFocus={() => setAt(last >= 0 ? last : null)}
        onBlur={() => setAt(null)}
        onKeyDown={keys}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={margin.left} x2={width - margin.right} y1={y(t)} y2={y(t)} className="stroke-border" />
            <text x={margin.left - 8} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-xs tabular-nums">
              {format(t)}
            </text>
          </g>
        ))}
        {compact
          ? null
          : labels.map((l, i) =>
              i % every === 0 ? (
                <text key={`${l}-${i}`} x={x(i)} y={height - 4} textAnchor={i === 0 ? "start" : "middle"} className="fill-muted-foreground text-xs tabular-nums">
                  {l}
                </text>
              ) : null,
            )}
        {previous ? (
          <path d={pathOf(previous, x, y)} fill="none" strokeWidth={2} strokeDasharray="2 5" strokeLinecap="round" className="stroke-muted-foreground" />
        ) : null}
        <m.path
          key={`${labels.length}-${end}`}
          d={pathOf(current, x, y)}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-primary-fill"
          initial={calm ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        />
        {end !== null ? <circle cx={x(last)} cy={y(end)} r={4} className="fill-primary-fill stroke-background" strokeWidth={2} /> : null}
        {compact || end === null ? null : (
          <text x={x(last) + 10} y={y(end) + lift} className="fill-foreground text-xs font-semibold tabular-nums">
            {format(end)}
          </text>
        )}
        {compact || endPrev === null ? null : (
          <text x={x(lastPrev) + 10} y={y(endPrev) + drop} className="fill-muted-foreground text-xs tabular-nums">
            {format(endPrev)}
          </text>
        )}
        {shown ? <line x1={x(shown.i)} x2={x(shown.i)} y1={margin.top} y2={height - margin.bottom} className="stroke-foreground opacity-35" /> : null}
      </svg>
      {shown ? (
        <div role="status" className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-lg border bg-background px-2.5 py-2 text-sm shadow-md" style={{ left }}>
          <p className="mb-1 font-medium text-muted-foreground">{labels[shown.i]}</p>
          {shown.now !== null ? <Readout value={format(shown.now)} name={names[0]} line="bg-primary-fill" /> : null}
          {shown.then !== null ? <Readout value={format(shown.then)} name={names[1]} line="bg-muted-foreground" /> : null}
          {shown.now !== null && shown.then ? (
            <p className="mt-1 border-t pt-1 text-muted-foreground">
              {shown.now >= shown.then ? "+" : ""}
              {(((shown.now - shown.then) / shown.then) * 100).toFixed(1)}% on the same point
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Readout({ value, name, line }: { value: string; name?: string; line: string }) {
  return (
    <p className="flex items-center gap-2">
      <i aria-hidden="true" className={`h-0.5 w-3 flex-none ${line}`} />
      <strong className="font-semibold tabular-nums">{value}</strong>
      {name ? <span className="ml-auto pl-3 text-muted-foreground">{name}</span> : null}
    </p>
  )
}

/** The key for a chart of two lines: each mark as it is drawn, so it never rests on colour. */
export function ChartLegend({ names }: { names: readonly [string, string] }) {
  return (
    <div className="flex gap-3.5 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <svg aria-hidden="true" viewBox="0 0 18 4" className="h-1 w-4.5">
          <line x1="0" y1="2" x2="18" y2="2" strokeWidth="2" className="stroke-primary-fill" />
        </svg>
        {names[0]}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg aria-hidden="true" viewBox="0 0 18 4" className="h-1 w-4.5">
          <line x1="0" y1="2" x2="18" y2="2" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" className="stroke-muted-foreground" />
        </svg>
        {names[1]}
      </span>
    </div>
  )
}
