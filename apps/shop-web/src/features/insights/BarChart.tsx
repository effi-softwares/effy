import type { InsightsBucketDTO, InsightsFigureDTO, ComparisonBasis } from "@effy/shared-types"

import { barHeights, deltaText } from "./model"

/**
 * One of the twin bar charts (058, US3).
 *
 * ⚠ PLAIN DIVS, NO CHART LIBRARY. The design draws flat bars with mono axis labels; recharts would
 * add ~400 KB to a login-gated console (041 recorded that cost) to render rectangles. It also means
 * this slice uses no `--chart-*` token at all — the data-visualisation palette exists for charts that
 * need to distinguish series, and a single-series bar chart does not.
 *
 * ⚠ EVERY BUCKET IS DRAWN, INCLUDING THE EMPTY ONES. A missing bar and a zero bar say different
 * things: a chart that silently omits quiet hours misreports the shape of a trading day.
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
}) {
  const heights = barHeights(buckets.map(valueOf))

  return (
    <section className="min-w-0">
      <header className="flex flex-wrap items-baseline gap-3 border-b pb-3">
        <div className="grid gap-[3px]">
          <h2 className="text-sm font-semibold">{title}</h2>
          {/* nowrap so the twin headers sit at the same height, as the brief requires. */}
          <p className="text-muted-foreground text-[12.5px] whitespace-nowrap">{subtitle}</p>
        </div>
        <div className="flex-1" />
        <div className="grid gap-[3px] text-right">
          <p className="text-[15px] font-semibold tabular-nums whitespace-nowrap">{total}</p>
          <p className="text-muted-foreground text-[11.5px] whitespace-nowrap">
            {deltaText(figure, basis)}
          </p>
        </div>
      </header>

      {buckets.length === 0 ? (
        <p className="text-muted-foreground py-10 text-sm">No sales in this window.</p>
      ) : (
        <div className="flex h-[170px] items-end gap-1 pt-5">
          {buckets.map((b, i) => (
            <div
              key={b.start}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[7px]"
            >
              <div
                // The final bucket is the one still filling up; the primary fill marks it as "now"
                // rather than as "best" — monochrome, so it reads as emphasis and nothing more.
                className={
                  i === buckets.length - 1
                    ? "bg-primary w-full rounded-[3px]"
                    : "bg-muted w-full rounded-[3px]"
                }
                style={{ height: `${heights[i]}%` }}
                title={`${b.label}${b.partial ? " (partial)" : ""}`}
              />
              <span className="text-muted-foreground font-mono text-[10px] whitespace-nowrap">
                {b.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
