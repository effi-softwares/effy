import * as React from "react"

import { cn } from "../cn"

// PROGRESS AND METER (theme-adoption-prompt.md, Phase 2 §10).
//
// A 999px track on `--muted` with the fill in the SEMANTICALLY CORRECT token — not always the brand.
// A bar showing how much of an order is picked is brand (work in progress); one showing how close a
// shop is to a cut-off is warning; one showing a failure rate is destructive. The token is the
// statement, so it is a required prop rather than a default.

type Tone = "brand" | "success" | "warning" | "destructive" | "violet" | "teal" | "muted"

const FILL: Record<Tone, string> = {
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  violet: "bg-violet",
  teal: "bg-teal",
  muted: "bg-muted-foreground",
}

/**
 * A single-value bar.
 *
 * ⚠ `value` is clamped rather than trusted. A rollup that double-counts produces >100, and an
 * unclamped flex-basis paints past the track's rounded end — the bar then looks like a rendering
 * bug rather than like a number that needs looking at.
 */
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
 * A multi-segment bar with a legend: 8px swatch + muted label + 600 value.
 *
 * ⚠ Segments are separated by a 2px GAP, not by a border. A border on a coloured segment reads as a
 * sixth tone at small sizes; the gap lets the `--muted` track show through instead, which is already
 * the page's own separator colour.
 *
 * ⚠ Zero-valued segments are dropped from the BAR but kept in the LEGEND. A 0% segment renders as a
 * 2px sliver that looks like a rounding artifact, while removing it from the legend would silently
 * change what categories exist — and "none of these today" is information.
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
    <div data-slot="meter" className={cn("grid gap-2.5", className)} {...props}>
      <div className="flex w-full gap-0.5" style={{ height }}>
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn("size-2 shrink-0 rounded-full", FILL[s.tone])}
            />
            <span className="text-[12.5px] text-muted-foreground">{s.label}</span>
            <span className="font-mono text-[12.5px] font-semibold tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export { Progress, Meter }
