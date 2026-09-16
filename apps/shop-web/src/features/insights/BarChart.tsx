import type { InsightsBucketDTO, InsightsFigureDTO, ComparisonBasis } from "@effy/shared-types"

import { barHeights, deltaText, deltaToneClass } from "./model"

/**
 * One of the twin bar charts (058, US3).
 *
 * ⚠ PLAIN DIVS, NO CHART LIBRARY. The design draws flat bars with mono axis labels; recharts would
 * add ~400 KB to a login-gated console (041 recorded that cost) to render rectangles.
 *
 * ⚠ TWO SERIES, AND WHICH CHART GETS WHICH IS FIXED. The adopted design pairs these charts with
 * `--brand` for the first (revenue) and `--violet` for the second (volume) — the same two hues, in
 * the same order, every time. That consistency is the whole point: an operator who glances at a
 * cobalt bar knows it is money without reading the header. Swapping them per screen would make the
 * colour meaningless.
 *
 * ⚠ THE LATEST BUCKET IS AT FULL SATURATION, THE REST AT `-mid`. It marks "now" — the bucket still
 * filling up — rather than "best". A uniform chart makes the reader compare a partial bar against
 * complete ones without knowing it.
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
  series,
}: {
  title: string
  subtitle: string
  total: string
  figure: InsightsFigureDTO
  basis: ComparisonBasis
  buckets: readonly InsightsBucketDTO[]
  valueOf: (b: InsightsBucketDTO) => number
  /** `primary` is money (brand), `secondary` is volume (violet). Fixed by the design, not per call. */
  series: "primary" | "secondary"
}) {
  const latestFill = series === "primary" ? "bg-brand" : "bg-violet"
  const restFill = series === "primary" ? "bg-brand-mid" : "bg-violet-mid"
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
          <p className={`text-[11.5px] whitespace-nowrap ${deltaToneClass(figure)}`}>
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
                className={`w-full rounded-[3px] ${
                  i === buckets.length - 1 ? latestFill : restFill
                }`}
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
