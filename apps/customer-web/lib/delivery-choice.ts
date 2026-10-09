import type { CourierQuoteDTO, DeliveryFeeDTO, DeliveryQuoteDTO, DeliveryType, EffyWindowDTO, EffyWindowsDTO } from "@effy/shared-types"

/**
 * What a quote lets the shopper choose, and what each choice costs (077–079, one checkout since 083).
 *
 * Pure, so the checkout flow, the window picker and their tests agree on one reading of a quote.
 *
 * ⚠ ONE FEE FOR THE ORDER. The server prices the order once per open window (`effyWindows`), or once
 * for a courier (`courier.fee`); these functions PICK one and add nothing. The server re-prices at
 * the intent and refuses if the total it works out is not the one shown (`shownDeliveryAmount`).
 *
 * ⚠ WHAT IS OFFERED, THE QUOTE SAYS: `effyWindows` → the shopper picks ONE window for the order
 * (today's under "Same-day delivery", a later day's under "Standard delivery"), sent back as
 * `deliveryWindow`; `courier` → nothing to choose.
 */

/** The ONE window chosen for the order: a slot on a day (078). */
export interface ChosenWindow {
  slotId: string
  date: string
}

/** The windows Effy offers this order, or null when a courier delivers or the address is not served. */
export const effyWindowsOf = (quote: DeliveryQuoteDTO | null): EffyWindowsDTO | null =>
  quote?.serviced ? (quote.effyWindows ?? null) : null

/**
 * 079 — what a courier order is told and charged, when the quote says a courier delivers; else null.
 * There is then NOTHING to choose: no window, no day, no method.
 */
export const courierOf = (quote: DeliveryQuoteDTO | null): CourierQuoteDTO | null =>
  quote?.serviced && quote.coverage === "courier" ? (quote.courier ?? null) : null

/**
 * 079 — who delivers the order this quote is for, as the checkout SHOWS it and sends it back
 * (`deliveryType` on the intent): a courier, or Effy. Null only when the address is not served.
 *
 * ⚠ THE QUOTE SAYS, as with everything else here. The server refuses the intent if this is not what
 * applies by then, so nobody pays a courier fee for a screen that showed Effy's windows.
 */
export function deliveryTypeOf(quote: DeliveryQuoteDTO | null): DeliveryType | null {
  if (courierOf(quote)) return "courier"
  return effyWindowsOf(quote) ? "effy" : null
}

/** The chosen window as the quote offers it NOW; null when nothing is chosen or it is no longer offered. */
export function findWindow(quote: DeliveryQuoteDTO | null, chosen: ChosenWindow | null): EffyWindowDTO | null {
  if (!chosen) return null
  const day = effyWindowsOf(quote)?.days.find((d) => d.date === chosen.date)
  return day?.windows.find((w) => w.slotId === chosen.slotId) ?? null
}

/**
 * Carry the window across a NEW quote: kept while it is still on offer, dropped when it is not.
 * ⚠ Dropped means NOTHING is selected — a window that has gone is never replaced by another (FR-010).
 */
export const carryWindow = (quote: DeliveryQuoteDTO | null, chosen: ChosenWindow | null): ChosenWindow | null =>
  findWindow(quote, chosen) ? chosen : null

/** How many days after today a date is, among the days offered (0 = today). -1 when it is not offered. */
export const dayOffset = (w: EffyWindowsDTO, date: string): number => w.days.findIndex((d) => d.date === date)

/**
 * The delivery charge for what the shopper has chosen (077): the courier's fee, or the chosen
 * window's. Null until a window is chosen — there is no charge to show before there is one.
 */
export function chosenFee(quote: DeliveryQuoteDTO | null, window: ChosenWindow | null): DeliveryFeeDTO | null {
  if (!quote?.serviced) return null
  // 079 — a courier delivers: ONE fee, already decided.
  if (quote.courier) return quote.courier.fee
  return findWindow(quote, window)?.fee ?? null
}

/** Whether the fee shown is free because the basket reached the free-delivery amount. */
export const isFreeDelivery = (fee: DeliveryFeeDTO | null): boolean => fee?.lines.some((l) => l.kind === "free_delivery") ?? false

/**
 * Whether the order's place in its window has lapsed and must be renewed before payment is confirmed.
 *
 * ⚠ FALSE WHEN THERE IS NO HOLD. A courier order holds nothing, and an unparseable value is treated
 * as "no hold" rather than as "lapsed": renewing costs a round trip, but refusing to let someone pay
 * because a timestamp was malformed would cost the order.
 */
export function holdLapsed(slotHeldUntil: string | null | undefined, nowMs: number): boolean {
  if (!slotHeldUntil) return false
  const until = Date.parse(slotHeldUntil)
  return !Number.isNaN(until) && nowMs >= until
}
