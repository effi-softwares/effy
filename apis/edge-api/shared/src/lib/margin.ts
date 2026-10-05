/**
 * Effy's margin — 067-product-approval-margin.
 *
 * A shop states what it wants to be paid (the SHOP price). Effy adds a MARGIN. The customer pays the
 * sum (the CUSTOMER price). This is the one place that arithmetic is written.
 *
 * ⚠ ONE HOME (Principle II). The approval, the margin editor and the reviewer's "this will sell at"
 * preview all call this. Checkout never computes a margin at all — it reads `price_amount`,
 * which an approval wrote from here — so there is no Go mirror to keep in step.
 *
 * ⚠ INTEGER CENTS THROUGHOUT. A percentage of a price is the classic place a float turns 12.00 into
 * 11.999999; everything here is done in whole cents with one explicit rounding.
 */

export type MarginKind = "percent" | "amount";

/** `value` is a decimal string as the reviewer typed it: "12.5" (percent) or "2.00" (amount). */
export interface Margin {
  kind: MarginKind;
  value: string;
}

export type MarginError = "invalid" | "negative" | "too_large";

export type MarginResult = { ok: true; margin: Margin } | { ok: false; reason: MarginError };

const DECIMAL = /^\d+(\.\d+)?$/;

/** A percentage above this is almost certainly a typo (1250 for 12.5), not a pricing decision. */
const MAX_PERCENT = 1000;
const MAX_AMOUNT_CENTS = 100_000_00;

/** Decimal string → an exact integer scaled by 10^scale, with no float in between. */
function scaled(value: string, scale: number): bigint {
  const [whole, frac = ""] = value.split(".");
  const padded = (frac + "0".repeat(scale)).slice(0, scale);
  return BigInt(whole + padded);
}

/**
 * Validate what a reviewer entered. Zero is VALID — Effy may pass a product through at the shop's
 * price — but it has to be typed: an absent margin is "not set", never zero (FR-029).
 */
export function validateMargin(input: unknown): MarginResult {
  if (typeof input !== "object" || input === null) return { ok: false, reason: "invalid" };
  const { kind, value } = input as { kind?: unknown; value?: unknown };
  if (kind !== "percent" && kind !== "amount") return { ok: false, reason: "invalid" };

  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string") return { ok: false, reason: "invalid" };
  const trimmed = text.trim();
  if (trimmed.startsWith("-")) return { ok: false, reason: "negative" };
  if (!DECIMAL.test(trimmed)) return { ok: false, reason: "invalid" };

  if (kind === "percent") {
    // Four decimal places is what the column holds.
    if (scaled(trimmed, 4) > BigInt(MAX_PERCENT) * 10_000n) return { ok: false, reason: "too_large" };
  } else if (scaled(trimmed, 2) > BigInt(MAX_AMOUNT_CENTS)) {
    return { ok: false, reason: "too_large" };
  }
  return { ok: true, margin: { kind, value: trimmed } };
}

/**
 * What the customer pays, in cents.
 *
 * `null` margin = "not set": the customer pays the shop's price (FR-033).
 * A percentage is rounded HALF UP to a whole cent — once, here.
 */
export function customerPriceCents(shopCents: number, margin: Margin | null): number {
  if (!Number.isInteger(shopCents) || shopCents < 0) throw new Error("margin: shop price must be whole cents");
  if (margin === null) return shopCents;

  if (margin.kind === "amount") return shopCents + Number(scaled(margin.value, 2));

  // shop × percent / 100, with percent held to 4 decimal places → divide by 100 × 10^4.
  const numerator = BigInt(shopCents) * scaled(margin.value, 4);
  const denominator = 1_000_000n;
  const added = (numerator + denominator / 2n) / denominator; // half up
  return shopCents + Number(added);
}

/** "12.34" → 1234. Refuses anything that is not a non-negative amount with at most two decimals. */
export function toCents(amount: string): number {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) throw new Error("margin: not a money amount");
  return Number(scaled(trimmed, 2));
}

export function fromCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error("margin: cents must be a non-negative integer");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** Convenience over decimal strings — what repositories and DTO mappers hold. */
export function customerPrice(shopAmount: string, margin: Margin | null): string {
  return fromCents(customerPriceCents(toCents(shopAmount), margin));
}
