// The delivery quote a shopper sees before paying, and its wire form (047, 069).
import { formatCents, operatingStamp, pooled, type Queryable } from "@effy/edge-shared";
import {
  normalizePostcode, quote as deliveryQuote, type PackageInput, type QuoteResult,
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

export type DeliveryQuoter = (customerId: string | null, postcode: string, pkgs: readonly PackageInput[], now: Date) => Promise<QuoteResult>;

export const defaultQuoter = (db: Queryable = pooled): DeliveryQuoter => (customerId, postcode, pkgs, now) =>
  deliveryQuote(db, customerId, postcode, pkgs, now);

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

/**
 * The quote as the client receives it.
 *
 * ⚠ A package is identified by an OPAQUE `pkg-N` — its position — never by its shop: the split
 * shows, the shop does not (hidden fulfilment). ⚠ Slots carry no capacity and days carry no fee: a
 * slot's fullness is Effy's business, and the fee belongs to the METHOD.
 * ⚠ Arrays are never null: a client iterates them without a guard.
 */
export function toQuoteDTO(postcode: string, q: QuoteResult, now: Date): DeliveryQuoteDTO {
  if (!q.serviced) {
    return {
      postcode, serviced: false, sameDayAvailableUntil: null, packages: [], expiresAt: "",
      sameDaySlots: [], sameDayUnavailableReason: null, standardDays: [],
    };
  }
  return {
    postcode,
    serviced: true,
    sameDayAvailableUntil: q.sameDayUntil ? operatingStamp(q.sameDayUntil) : null,
    packages: q.packages.map((p, i) => ({
      shopRef: `pkg-${i + 1}`,
      options: p.options.map((o) => ({
        method: o.method as "same_day" | "standard", feeAmount: formatCents(o.feeCents), promisedFrom: null, promisedTo: null,
      })),
    })),
    // ⚠ With the Melbourne offset, like every other time in this document (069 FR-029) — one
    // rule for a client to read, not one field that is the odd one out.
    expiresAt: operatingStamp(new Date(now.getTime() + QUOTE_VALIDITY_MS)),
    sameDaySlots: q.sameDaySlots.map((s) => ({
      slotId: s.id, date: s.date, startAt: operatingStamp(s.start), endAt: operatingStamp(s.end), cutoffAt: operatingStamp(s.cutoff),
    })),
    sameDayUnavailableReason: q.sameDayUnavailable as DeliveryQuoteDTO["sameDayUnavailableReason"],
    standardDays: q.standardDays.map((date) => ({ date })),
  };
}

/** What is captured on the order: the SHOP-keyed quote, for the platform's own later use. */
export function capturedQuote(q: Extract<QuoteResult, { serviced: true }>) {
  return {
    serviced: true,
    packages: q.packages.map((p) => ({
      shopId: p.shopId,
      options: p.options.map((o) => ({ method: o.method, feeAmount: formatCents(o.feeCents) })),
    })),
  };
}

/** Quote delivery for the shopper's current cart to one of their addresses. Reads only. */
export async function quoteForCheckout(
  deps: { store: CheckoutStore; quoter: DeliveryQuoter },
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
  const [delivery, points] = await Promise.all([
    deps.quoter(customerId, postcode, packagesFromLines(lines), now),
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
