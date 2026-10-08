import { DELIVERY_FEE_LINE_LABEL, type DeliveryFeeBreakdownDTO } from "@effy/shared-types";

const dollars = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;
const signed = (amount: string) => (amount.startsWith("-") ? `−$${amount.slice(1)}` : `$${amount}`);
const kg = (grams: number) => `${Number((grams / 1000).toFixed(3))} kg`;

/**
 * "How this fee was built" (077 FR-037) — read from what the ORDER stored when it was placed, never
 * worked out again, so it explains the fee that was charged even after the business changed prices.
 *
 * ⚠ STAFF ONLY: it names the distance, the weight and the plan. Rendered nowhere a customer or a
 * shop can see. ⚠ A detail list, not a card. Absent for an order placed before 077.
 */
export function FeeBreakdown({ breakdown }: { breakdown: DeliveryFeeBreakdownDTO }) {
  const { inputs, parts } = breakdown;
  const rows: [string, string, string][] = [];
  if (breakdown.kind === "effy") {
    rows.push(["Base", "every delivery starts here", dollars(parts.baseCents)]);
    rows.push([
      "Distance",
      `${inputs.km} km — ${parts.distanceBandUpperKm === null ? "the last band, with no upper limit" : `the band up to ${parts.distanceBandUpperKm} km`}`,
      dollars(parts.distanceCents),
    ]);
  } else {
    rows.push(["Courier, per order", "the flat amount", dollars(parts.baseCents)]);
  }
  rows.push([
    "Weight",
    `${kg(inputs.grams)} — ${parts.weightBandUpperGrams === null ? "the heaviest band" : `the band up to ${kg(parts.weightBandUpperGrams)}`}`,
    dollars(parts.weightCents),
  ]);
  if (parts.premiumCents > 0) rows.push(["Window surcharge", inputs.windowIsToday ? "a window today" : "the chosen window", dollars(parts.premiumCents)]);
  if (parts.roundedCents !== parts.rawCents) rows.push(["Rounded up", `from ${dollars(parts.rawCents)}`, dollars(parts.roundedCents)]);
  if (parts.clamp) rows.push([parts.clamp === "floor" ? "Minimum fee" : "Maximum fee", "applied", ""]);
  if (parts.freeApplied) rows.push(["Free delivery", `the basket (${dollars(inputs.basketCents)}) reached the free-delivery amount`, ""]);
  if (parts.smallOrderCents > 0) rows.push(["Small-order fee", `the basket was ${dollars(inputs.basketCents)}`, dollars(parts.smallOrderCents)]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">How the delivery fee was built</h2>
      <p className="text-sm text-muted-foreground">Priced by {breakdown.plan.name} when the order was placed.</p>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr_max-content]">
        {rows.map(([label, detail, amount]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{detail}</dd>
            <dd className="tabular-nums sm:text-right">{amount}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm font-medium">What the customer was shown</p>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        {breakdown.lines.map((l, i) => (
          <div key={`${l.kind}-${i}`} className="contents">
            <dt className="text-muted-foreground">{DELIVERY_FEE_LINE_LABEL[l.kind]}</dt>
            <dd className="tabular-nums">{signed(l.amount)}</dd>
          </div>
        ))}
        <dt className="font-medium text-foreground">Delivery total</dt>
        <dd className="font-medium tabular-nums">{dollars(parts.totalCents)}</dd>
      </dl>
    </section>
  );
}
