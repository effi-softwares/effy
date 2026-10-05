/**
 * Exact money: integer minor units (cents), never floats.
 *
 * Amounts cross the database and the wire as 2-dp decimal strings (`numeric(12,2)::text`). They are
 * parsed to whole cents, computed on as integers, and formatted back. Every shopper-facing sum on
 * the platform goes through here — a second parser is how two totals for one cart come to differ
 * by a cent.
 *
 * ⚠ `parseCents` TRUNCATES past two places ("5.009" → 500). That is the rule the platform has
 * always applied to prices read from the database; a caller that must REFUSE a third decimal
 * (a goodwill refund typed by staff) checks that itself before calling.
 */

/** The single platform currency — a fixed commercial constant, not configuration. */
export const CURRENCY = "AUD";

const DIGITS = /^\d+$/;

/** Decimal string ("5", "5.5", "5.00", "-3.50") → integer cents. Throws on a malformed amount. */
export function parseCents(input: string): number {
  let s = input.trim();
  if (s === "") throw new Error("money: empty amount");

  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);

  const dot = s.indexOf(".");
  let whole = dot === -1 ? s : s.slice(0, dot);
  let frac = dot === -1 ? "" : s.slice(dot + 1);
  if (whole === "") whole = "0";
  if (!DIGITS.test(whole)) throw new Error(`money: bad amount "${input}"`);

  frac = frac.slice(0, 2).padEnd(2, "0");
  if (!DIGITS.test(frac)) throw new Error(`money: bad fraction in "${input}"`);

  const cents = Number(whole) * 100 + Number(frac);
  if (!Number.isSafeInteger(cents)) throw new Error(`money: amount out of range "${input}"`);
  return negative ? -cents : cents;
}

/** Integer cents → 2-dp decimal string (500 → "5.00"). */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`money: ${cents} is not a whole number of cents`);
  const abs = Math.abs(cents);
  const out = `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return cents < 0 ? `-${out}` : out;
}
