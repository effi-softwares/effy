import type { CustomerRefundDTO } from "@effy/shared-types"

/**
 * What happened to the shopper's money. Rendered only when there are refunds, beside the receipt and
 * never inside it (a receipt must reconcile against a bank statement). A problem is said in words, not
 * by colour.
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
    <section aria-labelledby="refunds-title" className="flex flex-col gap-4 rounded-lg border bg-card p-6 shadow-xs">
      <h2 id="refunds-title" className="leading-none font-semibold">
        {fullyRefunded ? "This order was refunded" : "Refunds on this order"}
      </h2>
      <ul className="flex flex-col gap-3 text-sm">
        {refunds.map((r, i) => (
          <li key={`${r.amount}-${r.refundedAt ?? i}`} className="flex justify-between gap-3">
            <span className={r.state === "completed" ? "font-medium text-brand" : "text-muted-foreground"}>
              {STATE_LABEL[r.state]}
            </span>
            <span className="tabular-nums">{r.amount}</span>
          </li>
        ))}
      </ul>
      <dl className="flex flex-col gap-2 border-t pt-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt>Refunded</dt>
          <dd className="tabular-nums">{refundedTotal}</dd>
        </div>
        {/* What the customer checks against their bank: paid, less what came back (the server's subtraction). */}
        <div className="flex justify-between gap-3 text-base font-semibold">
          <dt>You paid</dt>
          <dd className="tabular-nums">{amountPaidAfterRefunds}</dd>
        </div>
      </dl>
      <RefundTiming />
    </section>
  )
}

const STATE_LABEL: Record<CustomerRefundDTO["state"], string> = {
  on_its_way: "On its way back to you",
  completed: "Refunded",
  there_was_a_problem: "There was a problem — we’re looking into it",
}

/** The published refund policy's own sentence. It promises no credit line: an early refund often shows as a reversal. */
function RefundTiming() {
  return (
    <p className="text-xs text-muted-foreground">
      Refunds go back to the card or payment method you paid with, usually within a few business days —
      though when it appears depends on your bank. It may show as the original charge disappearing
      rather than as a separate credit.
    </p>
  )
}
