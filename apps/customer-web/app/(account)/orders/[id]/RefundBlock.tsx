import type { CustomerRefundDTO } from "@effy/shared-types"

/**
 * What happened to the shopper's money (055 US5, FR-023).
 *
 * ⚠ NOTHING RENDERS WHEN THERE ARE NO REFUNDS (FR-028) — the caller checks, and the server omits the
 * fields entirely, so an unrefunded order is byte-identical to its pre-055 self (SC-011).
 *
 * ⚠ IT SITS ALONGSIDE THE RECEIPT AND NEVER INSIDE IT (FR-024). What was charged is a historical
 * record; a document that silently rewrote itself after a refund could not be reconciled against a
 * bank statement, which is the one thing a receipt is for.
 *
 * ⚠ NO COLOUR CARRIES MEANING. A refund that had a problem is marked by the words "there was a
 * problem", not by a red tint a colour-blind reader loses entirely.
 */
export function RefundBlock({
  refunds,
  refundedTotal,
  amountPaidAfterRefunds,
  fullyRefunded,
}: {
  refunds: CustomerRefundDTO[]
  refundedTotal: string
  amountPaidAfterRefunds: string
  fullyRefunded: boolean
}) {
  return (
    <section className="rounded-xl border p-6">
      <h2 className="text-sm font-medium">
        {fullyRefunded ? "This order was refunded" : "Refunds on this order"}
      </h2>

      <ul className="mt-3 flex flex-col gap-2.5">
        {refunds.map((r, i) => (
          <li key={`${r.amount}-${r.refundedAt ?? i}`} className="flex justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{STATE_LABEL[r.state]}</span>
            <span className="tabular-nums">{r.amount}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-3 flex flex-col gap-1.5 border-t pt-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Refunded</dt>
          <dd className="tabular-nums">{refundedTotal}</dd>
        </div>
        {/* ⚠ The arithmetic a shopper checks against their bank: what they paid, less what came back.
            051 and 052 each shipped a receipt whose lines did not add up. */}
        <div className="flex justify-between gap-4 font-medium">
          <dt>You paid</dt>
          <dd className="tabular-nums">{amountPaidAfterRefunds}</dd>
        </div>
      </dl>

      <RefundTiming />
    </section>
  )
}

/**
 * ⚠ FIVE INTERNAL STATES ARRIVE AS THREE, and none of them says why. "Your bank rejected the refund"
 * is staff information: a shopper cannot act on it, and surfacing it invites them to argue with a
 * message that will not change (FR-026). What they need to know is that we know.
 */
const STATE_LABEL: Record<CustomerRefundDTO["state"], string> = {
  on_its_way: "On its way back to you",
  completed: "Refunded",
  there_was_a_problem: "There was a problem — we’re looking into it",
}

/**
 * ⚠ THE PUBLISHED POLICY'S OWN SENTENCE, NOT A SECOND ONE (FR-026 / T062). Two places describing the
 * same timing will drift, and the one that drifts is whichever a developer edits without opening the
 * legal document.
 *
 * ⚠ AND IT DELIBERATELY PROMISES NO CREDIT LINE. A refund issued soon after payment often appears as
 * a REVERSAL — the original charge simply vanishes from the statement and no separate credit ever
 * shows up (research R2). A shopper told to look for a credit will not find one, and will contact us
 * about money that has already been returned.
 */
function RefundTiming() {
  return (
    <p className="mt-3 text-[13px] text-muted-foreground">
      Refunds go back to the card or payment method you paid with, usually within a few business days —
      though when it appears depends on your bank. It may show as the original charge disappearing
      rather than as a separate credit.
    </p>
  )
}
