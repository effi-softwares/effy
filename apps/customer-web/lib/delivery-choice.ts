import type { DeliveryFeeDTO, DeliveryQuoteDTO } from "@effy/shared-types"

import { parseCents } from "@/lib/cart-totals"

/**
 * What a quote lets the shopper choose, and what each choice costs (069, 077).
 *
 * Pure, so the checkout flow, the options control and their tests agree on one reading of a quote.
 *
 * ⚠ 077: ONE FEE FOR THE ORDER, and a window may cost more than a later day. The server prices the
 * order once with no window (`standardFee`) and once per open window (`sameDaySlots[].fee`); these
 * functions PICK one and add nothing. The server re-prices at the intent and refuses if the total
 * it works out is not the one shown (`shownDeliveryAmount`).
 */
export type DeliveryMethodChoice = "standard" | "same_day"

export interface DeliveryShape {
  /** Same-day can be chosen at all: a slot is open and at least one delivery can go today. */
  sameDayOffered: boolean
  /** Some deliveries can go today and some cannot — choosing same-day needs a slot AND a day. */
  mixed: boolean
  /** How many deliveries the order arrives in, and how many of those can go today. */
  deliveries: number
  sameDayDeliveries: number
  /** The quote lists standard days to choose from. False only against a server older than 069. */
  daysOffered: boolean
}

const offersSameDay = (pkg: DeliveryQuoteDTO["packages"][number]) =>
  pkg.options.some((o) => o.method === "same_day")

export function shapeOf(quote: DeliveryQuoteDTO | null): DeliveryShape {
  if (!quote?.serviced) {
    return { sameDayOffered: false, mixed: false, deliveries: 0, sameDayDeliveries: 0, daysOffered: false }
  }
  const sameDayDeliveries = quote.packages.filter(offersSameDay).length
  // ⚠ ANY, not EVERY (research R7). Before 069 same-day was offered only when every package could go
  // today, so a basket with one excepted shop could not be placed same-day from the web at all —
  // though the server has always resolved the method per package (047 SC-011).
  const sameDayOffered = sameDayDeliveries > 0 && (quote.sameDaySlots?.length ?? 0) > 0
  return {
    sameDayOffered,
    mixed: sameDayOffered && sameDayDeliveries < quote.packages.length,
    deliveries: quote.packages.length,
    sameDayDeliveries,
    daysOffered: (quote.standardDays?.length ?? 0) > 0,
  }
}

/**
 * The delivery charge for what the shopper has chosen (077): the chosen window's fee when anything
 * goes today, the later-day fee otherwise. Null when same-day is chosen but no window yet — there
 * is no single charge to show until there is a window.
 *
 * ⚠ Against a server older than 077 (no `standardFee`), the old per-package sum stands in, as one
 * "Delivery" line — so a deploy out of step never shows a blank.
 */
export function chosenFee(
  quote: DeliveryQuoteDTO | null,
  method: DeliveryMethodChoice,
  slotId: string | null,
): DeliveryFeeDTO | null {
  if (!quote?.serviced) return null
  const sameDay = method === "same_day" && shapeOf(quote).sameDayOffered
  if (!quote.standardFee) {
    const cents = feesFor(quote, method).totalCents
    const amount = (cents / 100).toFixed(2)
    return { lines: cents > 0 ? [{ kind: "delivery", amount }] : [], totalAmount: amount }
  }
  if (!sameDay) return quote.standardFee
  const slot = (quote.sameDaySlots ?? []).find((s) => s.slotId === slotId)
  return slot?.fee ?? null
}

/** Whether the fee shown is free because the basket reached the free-delivery amount. */
export const isFreeDelivery = (fee: DeliveryFeeDTO | null): boolean => fee?.lines.some((l) => l.kind === "free_delivery") ?? false

/**
 * ⚠ COMPATIBILITY ONLY — a server older than 077 priced each package. The fee for one method, split
 * into the part that goes same-day and the part that goes standard.
 */
export function feesFor(
  quote: DeliveryQuoteDTO | null,
  method: DeliveryMethodChoice,
): { sameDayCents: number; standardCents: number; totalCents: number } {
  let sameDayCents = 0
  let standardCents = 0
  if (quote?.serviced) {
    for (const pkg of quote.packages) {
      const sameDay = pkg.options.find((o) => o.method === "same_day")
      const standard = pkg.options.find((o) => o.method === "standard") ?? pkg.options[0]
      if (method === "same_day" && sameDay) sameDayCents += parseCents(sameDay.feeAmount)
      else if (standard) standardCents += parseCents(standard.feeAmount)
    }
  }
  return { sameDayCents, standardCents, totalCents: sameDayCents + standardCents }
}

/**
 * Whether this method choice needs a slot, and whether it needs a day.
 *
 * ⚠ A DAY IS NEEDED ONLY WHEN DAYS WERE OFFERED. A quote from a server built before 069 carries no
 * `standardDays`; the server then defaults to the earliest day itself, and blocking the pay button on
 * a choice nobody was shown would stop every checkout for as long as the two deploys are out of step.
 */
export function needs(shape: DeliveryShape, method: DeliveryMethodChoice): { slot: boolean; day: boolean } {
  const sameDay = method === "same_day" && shape.sameDayOffered
  return { slot: sameDay, day: shape.daysOffered && (!sameDay || shape.mixed) }
}

/**
 * Carry a selection across a NEW quote: kept if it is still on offer, dropped if it is not.
 *
 * ⚠ DROPPED MEANS NOTHING IS SELECTED. A slot that has closed is never replaced by the next one
 * (FR-006/FR-010) — the shopper chooses again. A standard day falls back to the earliest, which is
 * the default the control would have shown anyway (FR-015).
 */
export function carrySlot(quote: DeliveryQuoteDTO | null, slotId: string | null): string | null {
  if (!slotId || !quote?.serviced) return null
  return (quote.sameDaySlots ?? []).some((s) => s.slotId === slotId) ? slotId : null
}

export function carryDay(quote: DeliveryQuoteDTO | null, day: string | null): string | null {
  const days = quote?.serviced ? (quote.standardDays ?? []) : []
  if (day && days.some((d) => d.date === day)) return day
  return days[0]?.date ?? null
}

/**
 * Whether the order's same-day place has lapsed and must be renewed before payment is confirmed.
 *
 * ⚠ FALSE WHEN THERE IS NO HOLD. A standard order holds nothing, and an unparseable value is treated
 * as "no hold" rather than as "lapsed": renewing costs a round trip, but refusing to let someone pay
 * because a timestamp was malformed would cost the order.
 */
export function holdLapsed(slotHeldUntil: string | null | undefined, nowMs: number): boolean {
  if (!slotHeldUntil) return false
  const until = Date.parse(slotHeldUntil)
  return !Number.isNaN(until) && nowMs >= until
}
