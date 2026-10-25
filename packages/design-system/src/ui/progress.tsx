import * as React from "react"

import { cn } from "../cn"

// Progress and meter: a `--muted` track with the fill in the semantically correct token, so the tone is a required prop.

type Tone = "brand" | "success" | "warning" | "destructive" | "violet" | "teal" | "muted"

const FILL: Record<Tone, string> = {
  brand: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  violet: "bg-violet",
  teal: "bg-teal",
  muted: "bg-muted-foreground",
}

/** A single-value bar. `value` is clamped: a double-counting rollup must not paint past the track. */
function Progress({
  value,
  tone = "brand",
  className,
  height = 6,
  label,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  value: number
  tone?: Tone
  height?: number
  label?: string
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={{ height }}
      className={cn("w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export type MeterSegment = { label: string; value: number; tone: Tone }

/**
 * A multi-segment bar with a legend (8px swatch, muted label, 600 value). Segments are separated by a
 * 2px gap, not a border. Zero-valued segments leave the bar but stay in the legend.
 */
function Meter({
  segments,
  className,
  height = 8,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  segments: MeterSegment[]
  height?: number
}) {
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0)
  return (
    <div data-slot="meter" className={cn("grid gap-3", className)} {...props}>
      <div className="flex w-full gap-1" style={{ height }}>
        {total === 0 ? (
          <div className="h-full w-full rounded-full bg-muted" />
        ) : (
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <div
                key={s.label}
                className={cn("h-full rounded-full", FILL[s.tone])}
                style={{ flex: `${s.value} 0 0` }}
              />
            ))
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn("size-2 shrink-0 rounded-full", FILL[s.tone])}
            />
            <span className="text-xs text-muted-foreground">{s.label}</span>
            <span className="font-mono text-xs font-semibold tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export { Progress, Meter }
