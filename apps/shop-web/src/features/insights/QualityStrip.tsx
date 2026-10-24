import type { ShopInsightsDTO } from "@effy/shared-types"

import { BASIS_LABEL, deltaText } from "./model"

/** A rate's change, in percentage points: "▲ 2.5 pts vs the previous 7 days". */
function pointsText(figure: NonNullable<ShopInsightsDTO["quality"]["foundRate"]>, basis: ShopInsightsDTO["comparison"]["basis"]): string {
  const { kind, amount } = figure.change
  if (kind === "none" || amount === null) return "Nothing to compare yet"
  const n = Number(amount)
  const arrow = n > 0 ? "▲" : n < 0 ? "▼" : "–"
  return `${arrow} ${Math.abs(n)} pts ${BASIS_LABEL[basis]}`
}

/** "18 min", "1 h 5 m": the average time from payment to ready. */
export function durationText(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)} h ${mins % 60} m`
}

/**
 * How well the shop fulfils (Insights, 099): found rate, can't-supply rate and average time to ready,
 * over the orders it finished in the window. One bordered row of figures, never cards. A window with
 * nothing to measure reads "—", never 0% or 100%. The change is in words and a glyph, never by colour
 * alone; a rate moves in percentage points.
 */
export function QualityStrip({ dto }: { dto: ShopInsightsDTO }) {
  const q = dto.quality
  const basis = dto.comparison.basis
  const cells = [
    {
      label: "Found rate",
      hint: "Units you supplied of units ordered",
      figure: q.foundRate,
      points: true,
      value: q.foundRate ? `${q.foundRate.value}%` : null,
    },
    {
      label: "Can't-supply rate",
      hint: "Orders you could not supply at all",
      figure: q.cantSupplyRate,
      points: true,
      value: q.cantSupplyRate ? `${q.cantSupplyRate.value}%` : null,
    },
    {
      label: "Average time to ready",
      hint: "From payment to marked ready",
      figure: q.averageTimeToReady,
      points: false,
      value: q.averageTimeToReady ? durationText(Number(q.averageTimeToReady.value)) : null,
    },
  ]
  return (
    <section className="grid gap-3" aria-labelledby="quality-heading">
      <h2 id="quality-heading" className="bo-section-title">
        How well you fulfil
      </h2>
      <dl className="sh-kpis">
        {cells.map((c) => (
          <div key={c.label} className="sh-kpi">
            <dt className="sh-kpi__label">{c.label}</dt>
            <dd className="sh-kpi__value">{c.value ?? "—"}</dd>
            <dd className="sh-kpi__sub">
              {c.figure ? (c.points ? pointsText(c.figure, basis) : deltaText(c.figure, basis)) : "No orders in this window yet"}
            </dd>
            <dd className="sh-kpi__sub">{c.hint}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
