import type { ShopInsightsDTO } from "@effy/shared-types"

import { BASIS_LABEL, deltaText } from "./model"

function pointsText(
  figure: NonNullable<ShopInsightsDTO["quality"]["foundRate"]>,
  basis: ShopInsightsDTO["comparison"]["basis"],
): string {
  const { kind, amount } = figure.change
  if (kind === "none" || amount === null) return "Nothing to compare yet"
  const n = Number(amount)
  const arrow = n > 0 ? "▲" : n < 0 ? "▼" : "–"
  return `${arrow} ${Math.abs(n)} pts ${BASIS_LABEL[basis]}`
}

function durationText(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)} h ${mins % 60} m`
}

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
      <h2 id="quality-heading" className="text-base font-semibold">
        How well you fulfil
      </h2>
      <dl className="kpis">
        {cells.map((c) => (
          <div key={c.label} className="kpi">
            <dt className="kpi__label">{c.label}</dt>
            <dd className="kpi__value">{c.value ?? "—"}</dd>
            <dd className="kpi__sub">
              {c.figure
                ? c.points
                  ? pointsText(c.figure, basis)
                  : deltaText(c.figure, basis)
                : "No orders in this window yet"}
            </dd>
            <dd className="kpi__sub">{c.hint}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
