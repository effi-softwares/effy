// The delivery quote a shopper sees before paying, and its wire form (047, 069).
import { formatCents, operatingStamp, pooled, type Queryable } from "@effy/edge-shared";
import {
  basketValueCents, feeDTO, METHOD_SAME_DAY, normalizePostcode, offersSameDay, quote as deliveryQuote,
  storedBreakdown, type PackageInput, type QuoteResult,
} from "@effy/edge-shared/delivery";
import type { DeliveryQuoteDTO } from "@effy/shared-types";

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

type ServicedQuote = Extract<QuoteResult, { serviced: true }>;

/**
 * ⚠ COMPATIBILITY ONLY (077 research R4) — the per-package `feeAmount` a client built before 077
 * still reads. Such a client shows, as the delivery fee, the SUM over packages of the chosen
 * method's option (standard where a package cannot go same-day). Delivery is one fee per order now,
 * so these figures are arranged to make that sum come out no LOWER than the charge:
 *
 *   standard   the later-day fee on the first package, nothing on the rest;
 *   same_day   on the first package that can go today: the DEAREST open window's fee, less whatever
 *              the standard-only packages already contribute; nothing on the rest.
 *
 * The dearest window, because that client cannot know which window's fee it is showing: a cheaper
 * window then charges a little less than was shown — never more. They mean nothing about any one
 * package. New clients read `standardFee` and each slot's `fee`. Removed by the checkout feature.
 */
export function compatibilityFees(q: ServicedQuote): { standard: number; sameDay: number }[] {
  const standardTotal = q.standardFee.totalCents;
  let dearest = 0;
  for (const f of q.slotFees.values()) dearest = Math.max(dearest, f.totalCents);

  const firstSameDay = q.packages.findIndex(offersSameDay);
  // What a same-day sum already includes from packages that fall back to standard: only the first
  // package carries a standard figure, so only it can contribute.
  const fromStandardOnly = firstSameDay > 0 ? standardTotal : 0;

  return q.packages.map((_, i) => ({
    standard: i === 0 ? standardTotal : 0,
    sameDay: i === firstSameDay ? Math.max(0, dearest - fromStandardOnly) : 0,
  }));
}

/**
 * The quote as the client receives it.
 *
 * ⚠ A package is identified by an OPAQUE `pkg-N` — its position — never by its shop: the split
 * shows, the shop does not (hidden fulfilment). ⚠ Slots carry no capacity: a slot's fullness is
 * Effy's business. ⚠ The fee is the ORDER's (077): `standardFee` with no window, each slot's `fee`
 * with that window — lines and a total, and nothing about distance, weight or the plan.
 * ⚠ Arrays are never null: a client iterates them without a guard.
 */
export function toQuoteDTO(postcode: string, q: QuoteResult, now: Date): DeliveryQuoteDTO {
  if (!q.serviced) {
    return {
      postcode, serviced: false, coverage: "none", sameDayAvailableUntil: null, packages: [], expiresAt: "",
      sameDaySlots: [], sameDayUnavailableReason: null, standardDays: [],
    };
  }
  const compat = compatibilityFees(q);
  const standardTotal = q.standardFee.totalCents;
  return {
    postcode,
    serviced: true,
    coverage: q.coverage,
    sameDayAvailableUntil: q.sameDayUntil ? operatingStamp(q.sameDayUntil) : null,
    packages: q.packages.map((p, i) => ({
      shopRef: `pkg-${i + 1}`,
      options: p.options.map((o) => ({
        method: o.method as "same_day" | "standard",
        feeAmount: formatCents(o.method === METHOD_SAME_DAY ? compat[i]!.sameDay : compat[i]!.standard),
        promisedFrom: null, promisedTo: null,
      })),
    })),
    // ⚠ With the Melbourne offset, like every other time in this document (069 FR-029) — one
    // rule for a client to read, not one field that is the odd one out.
    expiresAt: operatingStamp(new Date(now.getTime() + QUOTE_VALIDITY_MS)),
    sameDaySlots: q.sameDaySlots.map((s) => {
      const fee = q.slotFees.get(s.id) ?? q.standardFee;
      return {
        slotId: s.id, date: s.date, startAt: operatingStamp(s.start), endAt: operatingStamp(s.end), cutoffAt: operatingStamp(s.cutoff),
        // What choosing THIS window adds over a later day — shown before it is chosen (077 FR-030).
        surchargeAmount: formatCents(Math.max(0, fee.totalCents - standardTotal)),
        fee: feeDTO(fee),
      };
    }),
    sameDayUnavailableReason: q.sameDayUnavailable as DeliveryQuoteDTO["sameDayUnavailableReason"],
    standardDays: q.standardDays.map((date) => ({ date })),
    // 077 — appended, so everything a client built before 077 reads is where it was.
    standardFee: feeDTO(q.standardFee),
    freeDeliveryRemainingAmount: q.freeDeliveryRemainingCents === null ? null : formatCents(q.freeDeliveryRemainingCents),
  };
}

/**
 * What is captured on the order: the SHOP-keyed quote, for the platform's own later use — which
 * packages could go today, and every delivery charge the shopper was offered, with how it was built.
 */
export function capturedQuote(q: ServicedQuote) {
  return {
    serviced: true,
    packages: q.packages.map((p) => ({ shopId: p.shopId, methods: p.options.map((o) => o.method) })),
    standardFee: storedBreakdown(q.standardFee),
    slotFees: [...q.slotFees.values()].map(storedBreakdown),
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
