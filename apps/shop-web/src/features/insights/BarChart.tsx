import type { InsightsBucketDTO, InsightsFigureDTO, ComparisonBasis } from "@effy/shared-types"

import { barHeights, deltaText, deltaToneClass } from "./model"

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
  series: "primary" | "secondary"
}) {
  const latestFill = "bg-primary"
  const restFill = "bg-primary/30"
  const heights = barHeights(buckets.map(valueOf))

  return (
    <section className="ef-panel min-w-0">
      <header className="ef-panel__head items-start!">
        <div className="grid gap-1">
          <h2 className="ef-panel__title">{title}</h2>
          <p className="ef-panel__desc whitespace-nowrap">{subtitle}</p>
        </div>
        <div className="grid gap-1 text-right">
          <p className="text-2xl leading-7 font-semibold tracking-[-.02em] tabular-nums whitespace-nowrap">{total}</p>
          <p className={`text-sm whitespace-nowrap ${deltaToneClass(figure)}`}>{deltaText(figure, basis)}</p>
        </div>
      </header>

      {buckets.length === 0 ? (
        <p className="px-5 py-10 text-muted-foreground">No sales in this window.</p>
      ) : (
        <div className="flex h-50 items-end gap-1 px-5 pt-5 pb-4">
          {buckets.map((b, i) => (
            <div key={b.start} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <div
                className={`w-full rounded-sm ${i === buckets.length - 1 ? latestFill : restFill}`}
                style={{ height: `${heights[i]}%` }}
                title={`${b.label}${b.partial ? " (partial)" : ""}`}
              />
              <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{b.label}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
