// The delivery quote a shopper sees before paying, and its wire form (077–079).
import { emitMetric, formatCents, metricNamespace, operatingStamp, pooled, type Queryable } from "@effy/edge-shared";
import {
  basketValueCents, feeDTO, normalizePostcode, quote as deliveryQuote,
  storedBreakdown, windowKey, type EffyWindowsQuote, type PackageInput, type PricedFee, type QuoteResult,
} from "@effy/edge-shared/delivery";
import type { DeliveryQuoteDTO, EffyWindowsDTO } from "@effy/shared-types";

import { isUuid } from "../lib/ids";
import type { CheckoutLine, CheckoutStore } from "./store";

/**
 * The least a card can be charged (AUD). ⚠ A FIXED PROVIDER FACT, not a business setting: below it the
 * provider refuses the intent, so a points total that leaves 30¢ for the card is refused up front with
 * the most points that leave a chargeable amount (research R4).
 */
export const CARD_MINIMUM_CENTS = 50;

/** How long a captured quote is honoured. */
export const QUOTE_VALIDITY_MS = 30 * 60_000;

export class AddressNotFoundError extends Error {}

/** `basketCents` is the basket's value for the fee's basket rules — `basketValueCents(...)`. */
export type DeliveryQuoter = (
  customerId: string | null, postcode: string, pkgs: readonly PackageInput[], now: Date, basketCents: number,
) => Promise<QuoteResult>;

export const defaultQuoter = (db: Queryable = pooled): DeliveryQuoter => (customerId, postcode, pkgs, now, basketCents) =>
  deliveryQuote(db, customerId, postcode, pkgs, now, basketCents);

/**
 * The cart's promotional discount for a subtotal — the SAME rule the cart read applies, with usage
 * counted. The quote needs it for the same reason the intent does: free delivery and the small-order
 * fee are judged on the basket AFTER a promotion (077 FR-005), and a quote that judged it before
 * would promise a free delivery the intent then charges for.
 */
export type PromoSource = (customerId: string, payableCents: number) => Promise<{ cents: number; promo: { id: string; code: string } | null }>;

/** The destination postcode from an address snapshot; null when it is missing or malformed. */
export function destinationPostcode(address: Record<string, unknown>): string | null {
  return typeof address.postalCode === "string" ? normalizePostcode(address.postalCode) : null;
}

/**
 * The cart lines grouped into per-shop packages, each with its total weight
 * (Σ unit weight × quantity). Order is first appearance, so a package's position is stable.
 */
export function packagesFromLines(lines: readonly CheckoutLine[]): PackageInput[] {
  const grams = new Map<string, number>();
  for (const l of lines) grams.set(l.shopId, (grams.get(l.shopId) ?? 0) + l.weightGrams * l.quantity);
  return [...grams].map(([shopId, g]) => ({ shopId, grams: g }));
}

type SellableQuote = Extract<QuoteResult, { serviced: true }>;

/**
 * 078 — the windows as the client receives them: today under `same_day`, every later day under
 * `standard`, each window with the order's charge and what it adds over a plain later day.
 *
 * ⚠ OPEN WINDOWS ONLY. A full window is absent — never sent with a flag or a count (069 FR-050).
 */
export function toEffyWindowsDTO(w: EffyWindowsQuote, baseFee: PricedFee): EffyWindowsDTO {
  return {
    days: w.days.map((d) => ({
      date: d.date,
      section: d.isToday ? "same_day" : "standard",
      windows: d.windows.map((s) => {
        const fee = w.fees.get(windowKey(s.id, d.date)) ?? baseFee;
        return {
          slotId: s.id, date: d.date, startAt: operatingStamp(s.start), endAt: operatingStamp(s.end), cutoffAt: operatingStamp(s.cutoff),
          surchargeAmount: formatCents(Math.max(0, fee.totalCents - baseFee.totalCents)),
          fee: feeDTO(fee),
        };
      }),
      closedReason: d.closedReason,
    })),
    unavailable: w.unavailable,
  };
}

/**
 * The quote as the client receives it: who delivers, and then either the windows to choose from or
 * the courier's estimate and fee.
 *
 * ⚠ NOTHING ABOUT HOW THE ORDER SPLITS — no package list, no shop (hidden fulfilment). ⚠ Windows
 * carry no capacity: a window's fullness is Effy's business. ⚠ The fee is the ORDER's (077): lines
 * and a total, and nothing about distance, weight or the plan.
 */
export function toQuoteDTO(postcode: string, q: QuoteResult, now: Date): DeliveryQuoteDTO {
  if (!q.serviced) return { postcode, serviced: false, coverage: "none", expiresAt: "" };
  // ⚠ With the Melbourne offset, like every other time in this document (069 FR-029).
  const expiresAt = operatingStamp(new Date(now.getTime() + QUOTE_VALIDITY_MS));
  const freeDeliveryRemainingAmount = q.freeDeliveryRemainingCents === null ? null : formatCents(q.freeDeliveryRemainingCents);
  if (q.coverage === "courier") {
    // 079 — a courier delivers. NOTHING TO CHOOSE: what the customer is told and charged is in
    // `courier`. ⚠ No distance, no courier company.
    return {
      postcode, serviced: true, coverage: "courier", expiresAt, freeDeliveryRemainingAmount,
      courier: { estimate: q.estimate, fee: feeDTO(q.fee), reason: q.reason },
    };
  }
  return {
    postcode, serviced: true, coverage: "effy", expiresAt, freeDeliveryRemainingAmount,
    effyWindows: toEffyWindowsDTO(q.effyWindows, q.baseFee),
  };
}

/**
 * What is captured on the order: the SHOP-keyed quote, for the platform's own later use — every
 * delivery charge the shopper was offered, with how it was built.
 */
export function capturedQuote(q: SellableQuote) {
  // 079 — a courier order: the one charge it was offered, the estimate it was told, and why.
  if (q.coverage === "courier") {
    return { serviced: true, coverage: "courier", reason: q.reason, estimate: q.estimate, fee: storedBreakdown(q.fee) };
  }
  return {
    serviced: true,
    coverage: "effy",
    shopIds: q.shopIds,
    // Every window offered, on every day, with how its charge was built.
    windowFees: [...q.effyWindows.fees].map(([key, fee]) => ({ date: key.split("|")[1], ...storedBreakdown(fee) })),
  };
}

/** Quote delivery for the shopper's current cart to one of their addresses. Reads only. */
export async function quoteForCheckout(
  deps: { store: CheckoutStore; quoter: DeliveryQuoter; promos: PromoSource },
  customerId: string,
  addressId: string,
  now: Date,
): Promise<DeliveryQuoteDTO> {
  if (!isUuid(addressId)) throw new AddressNotFoundError();
  const address = await deps.store.addressSnapshot(customerId, addressId);
  if (!address) throw new AddressNotFoundError();
  const postcode = destinationPostcode(address);
  if (!postcode) throw new AddressNotFoundError();

  const lines = await deps.store.cartLines(customerId);
  // The basket as the fee judges it: goods after the cart's promotion — the same two figures the
  // intent uses, so the quote and the charge cannot disagree about free delivery.
  const itemSubtotalCents = lines.reduce((sum, l) => sum + l.unitCents * l.quantity, 0);
  const discount = await deps.promos(customerId, itemSubtotalCents);
  const [delivery, points] = await Promise.all([
    deps.quoter(customerId, postcode, packagesFromLines(lines), now, basketValueCents(itemSubtotalCents, discount.cents)),
    deps.store.pointsFor(customerId, now),
  ]);
  // ⚠ A page, not a number to watch (078 FR-020): a covered address and not one window switched on.
  // Emitted HERE, on the read — a shopper who is shown "no windows" never reaches the intent call.
  if (delivery.serviced && delivery.coverage === "effy" && delivery.effyWindows.unavailable === "none_defined") emitMetric(metricNamespace(), "EffyWindowsNoneDefined");
  return {
    ...toQuoteDTO(postcode, delivery, now),
    // 074 — what the shopper can spend. ABSENT when they have none, so the control is not shown.
    // ⚠ The order total depends on the delivery choice still to be made, so the CLIENT works out the
    // most for this order; the intent call re-decides it and refuses what it cannot honour.
    ...(points.usable > 0
      ? { points: { usable: points.usable, centsPerPoint: points.centsPerPoint, cardMinimumAmount: formatCents(CARD_MINIMUM_CENTS) } }
      : {}),
  };
}
