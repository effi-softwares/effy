"use client"

import { courierLines, DELIVERY_TYPE_WORDS, type CourierQuoteDTO } from "@effy/shared-types"

import { Package } from "lucide-react"

import { Alert } from "@/components/ui/alert"
import { formatMoney } from "@/lib/money"

/**
 * The delivery section when a courier delivers the order: who, roughly when, and what it costs.
 *
 * There is nothing to choose, and so nothing to click. No window, no day, no method — a courier
 * order has none of them, and a disabled picker would only suggest one was meant to be there.
 *
 * Every word is shared-types' (`courierLines`, `DELIVERY_TYPE_WORDS`): the order page, the receipt,
 * the email and the customer app print the same two sentences. The estimate is the business's, and it
 * is always said AS an estimate — "2–4 business days" on its own reads like a promise.
 *
 * `no_window`: this address IS one Effy delivers to, and no window is left. The shopper is told
 * that first, then offered this — they were expecting a time to pick, and silence about where the
 * picker went would read as a fault.
 *
 * Text in a section — no card, no icon tile (Principle V).
 */
export function CourierDelivery({ courier, currency }: { courier: CourierQuoteDTO; currency: string }) {
  const [partner, estimate] = courierLines(courier.estimate)
  return (
    <section aria-label="Delivery" data-testid="courier-delivery">
      <h2 className="text-lg font-semibold">
        <span aria-hidden="true">2. </span>
        {DELIVERY_TYPE_WORDS.courier}
      </h2>
      {courier.reason === "no_window" ? (
        <Alert variant="muted" live className="mt-4">
          {DELIVERY_TYPE_WORDS.noWindowsLeft} {DELIVERY_TYPE_WORDS.courierInsteadOfWindows}
        </Alert>
      ) : null}
      <div className="mt-4 flex gap-3 rounded-md bg-primary-muted p-4">
        <Package aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
        <div className="min-w-0 text-sm">
          <p className="font-medium">{partner}</p>
          <p className="text-muted-foreground">{estimate}</p>
        </div>
      </div>
      <p className="mt-4 flex items-center justify-between border-t pt-4 text-sm">
        <span className="text-muted-foreground">Courier delivery fee</span>
        <span className="font-medium tabular-nums">{formatMoney(courier.fee.totalAmount, currency)}</span>
      </p>
    </section>
  )
}
