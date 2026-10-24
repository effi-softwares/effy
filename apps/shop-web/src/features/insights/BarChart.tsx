import type { InsightsBucketDTO, InsightsFigureDTO, ComparisonBasis } from "@effy/shared-types"

import { barHeights, deltaText, deltaToneClass } from "./model"

/**
 * One of the twin bar charts, in plain divs (a chart library would add ~400 KB to draw rectangles). The
 * first chart (revenue) is always `--brand`, the second (volume) `--violet`. The latest bucket, still
 * filling, is full strength, the rest `-mid`. Every bucket is drawn, empty ones included: a missing bar
 * and a zero bar say different things.
 */
export function BarChart({
  title,
  subtitle,
  total,
  figure,
  basis,
  buckets,
  valueOf,
}: {
  title: string
  subtitle: string
  total: string
  figure: InsightsFigureDTO
  basis: ComparisonBasis
  buckets: readonly InsightsBucketDTO[]
  valueOf: (b: InsightsBucketDTO) => number
  /** Which figure this is — money or volume. Both draw in the action blue. */
  series: "primary" | "secondary"
}) {
  // Both series are bars in the action blue (chart series 1); the current bucket is solid and the
  // earlier ones the lighter blue, so "now" reads at a glance.
  const latestFill = "bg-primary"
  const restFill = "bg-brand-mid"
  const heights = barHeights(buckets.map(valueOf))

  return (
    <section className="bo-panel min-w-0">
      <header className="bo-panel__head items-start!">
        <div className="grid gap-0.5">
          <h2 className="bo-panel__title">{title}</h2>
          {/* nowrap so the twin headers sit at the same height. */}
          <p className="bo-panel__desc whitespace-nowrap">{subtitle}</p>
        </div>
        <div className="grid gap-0.5 text-right">
          <p className="text-[22px] leading-7 font-semibold tracking-[-.02em] tabular-nums whitespace-nowrap">{total}</p>
          <p className={`text-[13px] whitespace-nowrap ${deltaToneClass(figure)}`}>
            {deltaText(figure, basis)}
          </p>
        </div>
      </header>

      {buckets.length === 0 ? (
        <p className="px-5 py-10 text-muted-foreground">No sales in this window.</p>
      ) : (
        <div className="flex h-[200px] items-end gap-1 px-5 pt-5 pb-4">
          {buckets.map((b, i) => (
            <div
              key={b.start}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[7px]"
            >
              <div
                className={`w-full rounded-[3px] ${
                  i === buckets.length - 1 ? latestFill : restFill
                }`}
                style={{ height: `${heights[i]}%` }}
                title={`${b.label}${b.partial ? " (partial)" : ""}`}
              />
              <span className="text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
                {b.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
