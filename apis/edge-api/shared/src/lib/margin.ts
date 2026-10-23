/**
 * Effy's margin: shop price + margin = customer price, written only here. Checkout never computes a
 * margin; it reads `price_amount`, which an approval wrote from here. Integer cents throughout.
 */

export type MarginKind = "percent" | "amount";

/** `value` as the reviewer typed it: "12.5" (percent) or "2.00" (amount). */
export interface Margin {
  kind: MarginKind;
  value: string;
}

export type MarginError = "invalid" | "negative" | "too_large";

export type MarginResult = { ok: true; margin: Margin } | { ok: false; reason: MarginError };

const DECIMAL = /^\d+(\.\d+)?$/;

/** Above this is almost certainly a typo (1250 for 12.5). */
const MAX_PERCENT = 1000;
const MAX_AMOUNT_CENTS = 100_000_00;

/** An exact integer scaled by 10^scale, with no float in between. */
function scaled(value: string, scale: number): bigint {
  const [whole, frac = ""] = value.split(".");
  const padded = (frac + "0".repeat(scale)).slice(0, scale);
  return BigInt(whole + padded);
}

/** Zero is valid (pass through at the shop's price) but must be typed: absent is "not set". */
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
    // The column holds four decimal places.
    if (scaled(trimmed, 4) > BigInt(MAX_PERCENT) * 10_000n) return { ok: false, reason: "too_large" };
  } else if (scaled(trimmed, 2) > BigInt(MAX_AMOUNT_CENTS)) {
    return { ok: false, reason: "too_large" };
  }
  return { ok: true, margin: { kind, value: trimmed } };
}

/** In cents. A null margin means the shop's price. A percentage rounds half up once, here. */
export function customerPriceCents(shopCents: number, margin: Margin | null): number {
  if (!Number.isInteger(shopCents) || shopCents < 0) throw new Error("margin: shop price must be whole cents");
  if (margin === null) return shopCents;

  if (margin.kind === "amount") return shopCents + Number(scaled(margin.value, 2));

  // shop × percent / 100, percent held to 4 places → divide by 100 × 10^4.
  const numerator = BigInt(shopCents) * scaled(margin.value, 4);
  const denominator = 1_000_000n;
  const added = (numerator + denominator / 2n) / denominator;
  return shopCents + Number(added);
}

/** "12.34" → 1234; a non-negative amount with at most two decimals. */
export function toCents(amount: string): number {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) throw new Error("margin: not a money amount");
  return Number(scaled(trimmed, 2));
}

export function fromCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error("margin: cents must be a non-negative integer");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** Over decimal strings, as repositories and mappers hold them. */
export function customerPrice(shopAmount: string, margin: Margin | null): string {
  return fromCents(customerPriceCents(toCents(shopAmount), margin));
}
