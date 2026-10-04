"use client"

import { useId } from "react"

import {
  formatArrival,
  formatDeliveryWindow,
  type DeliveryQuoteDTO,
} from "@effy/shared-types"

import { formatCents } from "@/lib/cart-totals"
import {
  feesFor,
  needs,
  shapeOf,
  type DeliveryMethodChoice,
} from "@/lib/delivery-choice"
import { formatMoney } from "@/lib/money"

/**
 * When the order arrives (069): the delivery method, a time slot for same-day, a day for standard.
 *
 * A CONTROLLED section, like the delivery instructions beside it: the choice lives in the checkout
 * flow so it survives the move to the payment step and a failed payment (FR-007).
 *
 * ⚠ NO SLOT IS EVER SELECTED FOR THE SHOPPER (FR-006). A same-day window is a promise about when
 * someone will be home; preselecting the first one makes that promise on their behalf. The standard
 * day IS preselected — the earliest — because "as soon as possible" is what a shopper who does not
 * care wants, and they should not have to say so (FR-015).
 *
 * ⚠ EVERY OPTION SHOWS ITS FEE, AND THEY ARE ALL THE SAME FEE. A slot and a day have no price of
 * their own; the fee is the method's (FR-021). It is repeated on each option because the client's
 * reference shows a price on every choice, and a shopper comparing slots should see for themselves
 * that the later one costs no more.
 *
 * ⚠ A LIST AND CHIPS INSIDE A SECTION — no cards (Principle V). Each group is a native radio group,
 * so arrow keys, the roving focus and the screen-reader "2 of 4" all come from the platform.
 */
export function DeliveryOptions({
  quote,
  method,
  onMethodChange,
  slotId,
  onSlotChange,
  standardDate,
  onStandardDateChange,
  currency,
  disabled = false,
  now = new Date(),
}: {
  quote: DeliveryQuoteDTO
  method: DeliveryMethodChoice
  onMethodChange: (next: DeliveryMethodChoice) => void
  slotId: string | null
  onSlotChange: (slotId: string) => void
  standardDate: string | null
  onStandardDateChange: (date: string) => void
  currency: string
  disabled?: boolean
  /** Injected for tests; "Today" and "Tomorrow" are relative to it. */
  now?: Date
}) {
  const group = useId()
  const shape = shapeOf(quote)
  const need = needs(shape, method)
  const money = (cents: number) => formatMoney(formatCents(cents), currency)

  const standardFees = feesFor(quote, "standard")
  const sameDayFees = feesFor(quote, "same_day")
  const chosen = method === "same_day" && shape.sameDayOffered ? sameDayFees : standardFees

  const nowMs = now.getTime()
  const slots = quote.sameDaySlots ?? []
  const days = quote.standardDays ?? []

  return (
    <section aria-label="Delivery">
      <h2 className="mb-3 text-xl font-semibold">Delivery</h2>

      {shape.sameDayOffered ? (
        <fieldset disabled={disabled}>
          <legend className="text-sm font-medium">How fast?</legend>
          <div className="mt-2 divide-y rounded-lg border">
            {(["same_day", "standard"] as const).map((m) => (
              <label key={m} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${group}-method`}
                    value={m}
                    checked={method === m}
                    onChange={() => onMethodChange(m)}
                  />
                  {m === "same_day" ? "Same-day delivery" : "Standard delivery"}
                </span>
                <span className="font-medium">{money((m === "same_day" ? sameDayFees : standardFees).totalCents)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        // ⚠ TWO DIFFERENT SENTENCES (FR-004). "Not in your area" will still be true tomorrow;
        // "today's times are taken" will not — and a shopper told the first when the second is true
        // will not come back tomorrow to find out.
        <p className="text-sm text-muted-foreground">
          {quote.sameDayUnavailableReason === "slots_closed"
            ? "Today’s same-day delivery times are closed or full. Standard delivery is available."
            : "Same-day delivery isn’t available for this address."}
        </p>
      )}

      {need.slot && (
        <fieldset disabled={disabled} className="mt-5">
          <legend className="text-sm font-medium">Choose a delivery time</legend>
          {shape.mixed && (
            <p className="mt-1 text-sm text-muted-foreground">
              {shape.sameDayDeliveries} of your {shape.deliveries} deliveries can arrive today.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {slots.map((slot) => {
              const selected = slot.slotId === slotId
              // Greyed out the moment its cutoff passes, without waiting for a re-quote. The server
              // refuses it regardless; this only spares the shopper finding out at the pay button.
              const closed = nowMs > new Date(slot.cutoffAt).getTime()
              return (
                <label
                  key={slot.slotId}
                  className={
                    "flex min-h-11 cursor-pointer flex-col justify-center rounded-md border px-3 py-1.5 text-sm transition-colors " +
                    "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring " +
                    (closed
                      ? "cursor-not-allowed opacity-50"
                      : selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted")
                  }
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name={`${group}-slot`}
                    value={slot.slotId}
                    checked={selected}
                    disabled={closed}
                    onChange={() => onSlotChange(slot.slotId)}
                  />
                  <span className="font-medium">
                    {formatArrival(
                      { promisedFrom: slot.date, promisedTo: slot.date, windowStart: slot.startAt, windowEnd: slot.endAt },
                      now,
                    )}
                  </span>
                  <span className={selected && !closed ? "text-xs opacity-90" : "text-xs text-muted-foreground"}>
                    {closed ? "Closed" : money(sameDayFees.sameDayCents)}
                    <span className="sr-only">
                      {" "}
                      {formatDeliveryWindow({ startAt: slot.startAt, endAt: slot.endAt })}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      )}

      {need.day && days.length > 0 && (
        <fieldset disabled={disabled} className="mt-5">
          <legend className="text-sm font-medium">
            {shape.mixed && need.slot ? "Choose a day for the rest" : "Choose a delivery day"}
          </legend>
          <div className="mt-2 divide-y rounded-lg border">
            {days.map((day) => (
              <label key={day.date} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${group}-day`}
                    value={day.date}
                    checked={standardDate === day.date}
                    onChange={() => onStandardDateChange(day.date)}
                  />
                  {formatArrival({ promisedFrom: day.date, promisedTo: day.date }, now)}
                </span>
                <span className="font-medium">{money(chosen.standardCents)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </section>
  )
}
