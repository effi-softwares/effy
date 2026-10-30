import { DELIVERY_FEE_LINE_LABEL, type DeliveryFeeBreakdownDTO } from "@effy/shared-types"

const dollars = (cents: number) => `AUD ${cents < 0 ? "−" : ""}${(Math.abs(cents) / 100).toFixed(2)}`
const signed = (amount: string) => (amount.startsWith("-") ? `AUD −${amount.slice(1)}` : `AUD ${amount}`)
const kg = (grams: number) => `${Number((grams / 1000).toFixed(3))} kg`

export function FeeBreakdown({ breakdown }: { breakdown: DeliveryFeeBreakdownDTO }) {
  const { inputs, parts } = breakdown
  const rows: [string, string, string][] = []
  if (breakdown.kind === "effy") {
    rows.push(["Base", "every delivery starts here", dollars(parts.baseCents)])
    rows.push([
      "Distance",
      `${inputs.km} km - ${parts.distanceBandUpperKm === null ? "the last band, with no upper limit" : `the band up to ${parts.distanceBandUpperKm} km`}`,
      dollars(parts.distanceCents),
    ])
  } else {
    rows.push(["Courier, per order", "the flat amount", dollars(parts.baseCents)])
  }
  rows.push([
    "Weight",
    `${kg(inputs.grams)} - ${parts.weightBandUpperGrams === null ? "the heaviest band" : `the band up to ${kg(parts.weightBandUpperGrams)}`}`,
    dollars(parts.weightCents),
  ])
  if (parts.premiumCents > 0)
    rows.push([
      "Window surcharge",
      inputs.windowIsToday ? "a window today" : "the chosen window",
      dollars(parts.premiumCents),
    ])
  if (parts.roundedCents !== parts.rawCents)
    rows.push(["Rounded up", `from ${dollars(parts.rawCents)}`, dollars(parts.roundedCents)])
  if (parts.clamp) rows.push([parts.clamp === "floor" ? "Minimum fee" : "Maximum fee", "applied", ""])
  if (parts.freeApplied)
    rows.push(["Free delivery", `the basket (${dollars(inputs.basketCents)}) reached the free-delivery amount`, ""])
  if (parts.smallOrderCents > 0)
    rows.push(["Small-order fee", `the basket was ${dollars(inputs.basketCents)}`, dollars(parts.smallOrderCents)])

  return (
    <section className="grid gap-3">
      <h3 className="text-[13px] font-semibold">The fee</h3>
      <table className="w-full border-collapse text-[13.5px] tabular-nums">
        <tbody className="[&_td]:border-b [&_td]:py-2 [&_td:last-child]:text-right">
          {rows.map(([label, detail, amount]) => (
            <tr key={label}>
              <td>
                {label}
                {detail ? <small className="block text-xs text-muted-foreground">{detail}</small> : null}
              </td>
              <td className="align-top">{amount}</td>
            </tr>
          ))}
          <tr className="font-semibold [&_td]:border-b-0 [&_td]:pt-3">
            <td>Charged</td>
            <td>{dollars(parts.totalCents)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">Priced by {breakdown.plan.name} when the order was placed.</p>
      <h3 className="mt-3 text-[13px] font-semibold">What the customer was shown</h3>
      <dl className="m-0 grid text-[13.5px] tabular-nums [&_div]:flex [&_div]:justify-between [&_div]:gap-6 [&_div]:py-1 [&_dd]:m-0 [&_dt]:text-muted-foreground">
        {breakdown.lines.map((l, i) => (
          <div key={`${l.kind}-${i}`}>
            <dt>{DELIVERY_FEE_LINE_LABEL[l.kind]}</dt>
            <dd>{signed(l.amount)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
