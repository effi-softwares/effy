"use client"

import { courierLines, DELIVERY_TYPE_WORDS, type CourierQuoteDTO } from "@effy/shared-types"

import { formatMoney } from "@/lib/money"

/**
 * The delivery section when a COURIER delivers the order (079): who, roughly when, and what it costs.
 *
 * ⚠ THERE IS NOTHING TO CHOOSE, AND SO NOTHING TO CLICK. No window, no day, no method — a courier
 * order has none of them, and a disabled picker would only suggest one was meant to be there.
 *
 * ⚠ EVERY WORD IS SHARED-TYPES' (`courierLines`, `DELIVERY_TYPE_WORDS`): the order page, the receipt,
 * the email and the customer app print the same two sentences. The estimate is the business's, and it
 * is always said AS an estimate — "2–4 business days" on its own reads like a promise.
 *
 * ⚠ `no_window`: this address IS one Effy delivers to, and no window is left. The shopper is told
 * that first, then offered this — they were expecting a time to pick, and silence about where the
 * picker went would read as a fault.
 *
 * ⚠ Text in a section — no card, no icon tile (Principle V).
 */
export function CourierDelivery({ courier, currency }: { courier: CourierQuoteDTO; currency: string }) {
  const [partner, estimate] = courierLines(courier.estimate)
  return (
    <section aria-label="Delivery" data-testid="courier-delivery">
      <h2 className="mb-3 text-xl font-semibold">{DELIVERY_TYPE_WORDS.courier}</h2>
      {courier.reason === "no_window" ? (
        <p role="status" className="mb-3 rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm">
          {DELIVERY_TYPE_WORDS.noWindowsLeft} {DELIVERY_TYPE_WORDS.courierInsteadOfWindows}
        </p>
      ) : null}
      <p className="text-sm">{partner}</p>
      <p className="text-sm text-muted-foreground">{estimate}</p>
      <p className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
        <span className="text-muted-foreground">Courier delivery fee</span>
        <span className="font-medium tabular-nums">{formatMoney(courier.fee.totalAmount, currency)}</span>
      </p>
    </section>
  )
}
