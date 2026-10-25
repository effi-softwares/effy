export const PAYMENT_MARKS = ["VISA", "MASTERCARD", "AMEX", "Apple Pay", "G Pay", "afterpay"] as const

/**
 * What checkout accepts, as text in a box (reference: footer, product page, order summary).
 *
 * Not the schemes' logos: these say which ways to pay exist without shipping six third-party assets
 * on every page. Whether a given wallet or pay-later option is offered to this customer on this device
 * is the payment provider's decision at checkout, not a promise made here.
 */
export function PaymentMarks({ className }: { className?: string }) {
  return (
    <ul aria-label="Ways to pay" className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      {PAYMENT_MARKS.map((mark) => (
        <li
          key={mark}
          className="inline-grid h-6 min-w-9 place-items-center rounded-sm border bg-background px-2 text-xs leading-none font-bold tracking-[0.02em]"
        >
          {mark}
        </li>
      ))}
    </ul>
  )
}
