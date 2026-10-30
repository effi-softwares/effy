import type { CourierQuoteDTO, DeliveryFeeDTO, DeliveryPromise, DeliveryQuoteDTO, DeliveryType, EffyWindowDTO, EffyWindowsDTO } from "@effy/shared-types"

/**
 * What a quote lets the shopper choose, and what each choice costs; pure, so the checkout, the window
 * picker and their tests read a quote one way. The server prices the order once per open window
 * (`effyWindows`) or once for a courier (`courier.fee`); these pick one and add nothing. The intent
 * refuses a total other than the one shown (`shownDeliveryAmount`).
 *
 * `effyWindows` → one window for the order (today's under "Same-day delivery", a later day's under
 * "Standard delivery"), sent back as `deliveryWindow`; `courier` → nothing to choose.
 */

/**
 * The one window chosen for the order: a slot on a day. 085 - it may be a later day's "Any
 * time" window (`EffyDayDTO.anyTime`): the order is then promised the day and no hours.
 */
export interface ChosenWindow {
  slotId: string
  date: string
}

/** "as soon as possible": no day and no time; the server picks the earliest day it can. */
export interface ChosenAsap {
  asap: true
}

/** What the shopper chose for an Effy order: a window (timed or a day's Any-time one), or asap. */
export type DeliveryChoice = ChosenWindow | ChosenAsap

export const isAsap = (c: DeliveryChoice | null): c is ChosenAsap => c !== null && "asap" in c

/** The window a choice names; null for "as soon as possible" and for no choice. */
export const windowOf = (c: DeliveryChoice | null): ChosenWindow | null => (c && !isAsap(c) ? c : null)

/** The windows Effy offers this order, or null when a courier delivers or the address is not served. */
export const effyWindowsOf = (quote: DeliveryQuoteDTO | null): EffyWindowsDTO | null =>
  quote?.serviced ? (quote.effyWindows ?? null) : null

/**
 * What a courier order is told and charged, when the quote says a courier delivers; else null.
 * There is then nothing to choose: no window, no day, no method.
 */
export const courierOf = (quote: DeliveryQuoteDTO | null): CourierQuoteDTO | null =>
  quote?.serviced && quote.coverage === "courier" ? (quote.courier ?? null) : null

/**
 * Who delivers the order this quote is for, as the checkout shows it and sends it back
 * (`deliveryType` on the intent): a courier, or Effy. Null only when the address is not served.
 *
 * The quote says, as with everything else here. The server refuses the intent if this is not what
 * applies by then, so nobody pays a courier fee for a screen that showed Effy's windows.
 */
export function deliveryTypeOf(quote: DeliveryQuoteDTO | null): DeliveryType | null {
  if (courierOf(quote)) return "courier"
  return effyWindowsOf(quote) ? "effy" : null
}

/**
 * The chosen window as the quote offers it now - a timed window or the day's Any-time one;
 * null when nothing is chosen, it is "as soon as possible", or it is no longer offered.
 */
export function findWindow(quote: DeliveryQuoteDTO | null, chosen: DeliveryChoice | null): EffyWindowDTO | null {
  const w = windowOf(chosen)
  if (!w) return null
  const day = effyWindowsOf(quote)?.days.find((d) => d.date === w.date)
  if (day?.anyTime?.slotId === w.slotId) return day.anyTime
  return day?.windows.find((x) => x.slotId === w.slotId) ?? null
}

/** What the choice promises; null when nothing is chosen or it is no longer offered. */
export function promiseOf(quote: DeliveryQuoteDTO | null, chosen: DeliveryChoice | null): DeliveryPromise | null {
  if (isAsap(chosen)) return "asap"
  const w = windowOf(chosen)
  if (!w) return null
  return effyWindowsOf(quote)?.days.find((d) => d.date === w.date)?.anyTime?.slotId === w.slotId ? "day" : "window"
}

/**
 * Carry the window across a new quote: kept while it is still on offer, dropped when it is not.
 * Dropped means nothing is selected - a window that has gone is never replaced by another.
 */
export const carryWindow = (quote: DeliveryQuoteDTO | null, chosen: DeliveryChoice | null): DeliveryChoice | null =>
  isAsap(chosen) ? (effyWindowsOf(quote)?.asap ? chosen : null) : findWindow(quote, chosen) ? chosen : null

/** How many days after today a date is, among the days offered (0 = today). -1 when it is not offered. */
export const dayOffset = (w: EffyWindowsDTO, date: string): number => w.days.findIndex((d) => d.date === date)

/**
 * The delivery charge for what the shopper has chosen: the courier's fee, or the chosen
 * window's. Null until a window is chosen - there is no charge to show before there is one.
 */
export function chosenFee(quote: DeliveryQuoteDTO | null, chosen: DeliveryChoice | null): DeliveryFeeDTO | null {
  if (!quote?.serviced) return null
  // A courier delivers: One fee, already decided.
  if (quote.courier) return quote.courier.fee
  // "as soon as possible" has one fee whatever day it lands on.
  if (isAsap(chosen)) return effyWindowsOf(quote)?.asap?.fee ?? null
  return findWindow(quote, chosen)?.fee ?? null
}

/** Whether the fee shown is free because the basket reached the free-delivery amount. */
export const isFreeDelivery = (fee: DeliveryFeeDTO | null): boolean => fee?.lines.some((l) => l.kind === "free_delivery") ?? false

/**
 * Whether the order's place in its window has lapsed and must be renewed before payment is confirmed.
 *
 * False when there is no hold. A courier order holds nothing, and an unparseable value is treated
 * as "no hold" rather than as "lapsed": renewing costs a round trip, but refusing to let someone pay
 * because a timestamp was malformed would cost the order.
 */
export function holdLapsed(slotHeldUntil: string | null | undefined, nowMs: number): boolean {
  if (!slotHeldUntil) return false
  const until = Date.parse(slotHeldUntil)
  return !Number.isNaN(until) && nowMs >= until
}
