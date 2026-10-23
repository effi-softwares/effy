import { emitMetric, formatCents, metricNamespace, operatingStamp, parseCents, pooled, type Queryable } from "@effy/edge-shared";
import {
  basketValueCents, feeDTO, normalizePostcode, quote as deliveryQuote,
  windowKey, type EffyWindowsQuote, type PackageInput, type PricedFee, type QuoteResult,
} from "@effy/edge-shared/delivery";
import type { DeliveryQuoteDTO, EffyWindowsDTO } from "@effy/shared-types";

import { isUuid } from "../lib/ids";
import type { Pricing } from "../promotions/pricing";
import type { CheckoutLine, CheckoutStore } from "./store";

/** The provider's minimum card charge (AUD), so a points total cannot leave less on the card. */
export const CARD_MINIMUM_CENTS = 50;

export const QUOTE_VALIDITY_MS = 30 * 60_000;

export class AddressNotFoundError extends Error {}

export type DeliveryQuoter = (
  customerId: string | null, postcode: string, pkgs: readonly PackageInput[], now: Date, basketCents: number,
) => Promise<QuoteResult>;

export const defaultQuoter = (db: Queryable = pooled): DeliveryQuoter => (customerId, postcode, pkgs, now, basketCents) =>
  deliveryQuote(db, customerId, postcode, pkgs, now, basketCents);

/** Free delivery and the small-order fee are judged after promotions, as the intent judges them. */
export type PromoSource = (input: {
  customerId: string;
  lines: readonly CheckoutLine[];
  deliveryType: "effy" | "courier" | null;
  deliveryFeeCents: number | null;
  now: Date;
  excludeOrderId?: string | null;
}) => Promise<Pricing>;

export function destinationPostcode(address: Record<string, unknown>): string | null {
  return typeof address.postalCode === "string" ? normalizePostcode(address.postalCode) : null;
}

/** Lines grouped into per-shop packages with total weight, in first-appearance order. */
export function packagesFromLines(lines: readonly CheckoutLine[]): PackageInput[] {
  const grams = new Map<string, number>();
  for (const l of lines) grams.set(l.shopId, (grams.get(l.shopId) ?? 0) + l.weightGrams * l.quantity);
  return [...grams].map(([shopId, g]) => ({ shopId, grams: g }));
}

/**
 * Today under `same_day`, later days under `standard`, each window with its charge and what it adds
 * over a plain later day. Full windows are absent, never flagged.
 */
export function toEffyWindowsDTO(w: EffyWindowsQuote, baseFee: PricedFee): EffyWindowsDTO {
  const windowDTO = (s: EffyWindowsQuote["days"][number]["windows"][number], date: string) => {
    const fee = w.fees.get(windowKey(s.id, date)) ?? baseFee;
    return {
      slotId: s.id, date, startAt: operatingStamp(s.start), endAt: operatingStamp(s.end), cutoffAt: operatingStamp(s.cutoff),
      surchargeAmount: formatCents(Math.max(0, fee.totalCents - baseFee.totalCents)),
      fee: feeDTO(fee),
    };
  };
  return {
    days: w.days.map((d) => ({
      date: d.date,
      section: d.isToday ? "same_day" : "standard",
      windows: d.windows.map((s) => windowDTO(s, d.date)),
      closedReason: d.closedReason,
      // Never today's: that one is the server's own, for asap orders.
      anyTime: !d.isToday && d.anyTime ? windowDTO(d.anyTime, d.date) : null,
    })),
    unavailable: w.unavailable,
    // No day: where an asap order lands is never told to the customer.
    asap: w.asap ? { estimate: w.asap.estimate, fee: feeDTO(w.asap.fee) } : null,
  };
}

/** No package list or shop, no window capacity, and no fee inputs: only lines and a total. */
export function toQuoteDTO(postcode: string, q: QuoteResult, now: Date): DeliveryQuoteDTO {
  if (!q.serviced) return { postcode, serviced: false, coverage: "none", expiresAt: "" };
  const expiresAt = operatingStamp(new Date(now.getTime() + QUOTE_VALIDITY_MS));
  const freeDeliveryRemainingAmount = q.freeDeliveryRemainingCents === null ? null : formatCents(q.freeDeliveryRemainingCents);
  if (q.coverage === "courier") {
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
  // Goods after promotions, as the intent judges them, so quote and charge agree on free delivery.
  const itemSubtotalCents = lines.reduce((sum, l) => sum + l.unitCents * l.quantity, 0);
  const priced = await deps.promos({ customerId, lines, deliveryType: null, deliveryFeeCents: null, now });
  const [delivery, points] = await Promise.all([
    deps.quoter(customerId, postcode, packagesFromLines(lines), now, basketValueCents(itemSubtotalCents, priced.outcome.goodsDiscountCents)),
    deps.store.pointsFor(customerId, now),
  ]);
  // Emitted on the read: a shopper shown no windows never reaches the intent.
  if (delivery.serviced && delivery.coverage === "effy" && delivery.effyWindows.unavailable === "none_defined") emitMetric(metricNamespace(), "EffyWindowsNoneDefined");
  return {
    ...withDeliveryPromotions(toQuoteDTO(postcode, delivery, now), priced),
    // Absent when the shopper has none. The client works out the most usable; the intent re-decides.
    ...(points.usable > 0
      ? { points: { usable: points.usable, centsPerPoint: points.centsPerPoint, cardMinimumAmount: formatCents(CARD_MINIMUM_CENTS) } }
      : {}),
  };
}

/** Each fee says what this shopper's delivery promotions take off it. */
export function withDeliveryPromotions<T>(dto: T, priced: Pricing): T {
  const reprice = priced.reprice;
  if (!reprice) return dto;
  const walk = (node: unknown, courier: boolean): unknown => {
    if (Array.isArray(node)) return node.map((n) => walk(n, courier));
    if (!node || typeof node !== "object") return node;
    const o = node as Record<string, unknown>;
    if (Array.isArray(o.lines) && typeof o.totalAmount === "string") {
      const off = reprice(courier ? "courier" : "effy", parseCents(o.totalAmount)).deliveryDiscountCents;
      return off > 0 ? { ...o, promotionAmount: formatCents(off) } : o;
    }
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(v, courier || k === "courier")]));
  };
  return walk(dto, false) as T;
}