import type { Queryable } from "../lib/db";
import { coverageForPostcode } from "./coverage";

const POSTCODE = /^[0-9]{4}$/;

/**
 * Trim and validate an Australian 4-digit postcode. `null` for anything that is not exactly four
 * digits after trimming — a malformed postcode is a 400, NEVER "we don't deliver there".
 */
export function normalizePostcode(input: string): string | null {
  const s = input.trim();
  return POSTCODE.test(s) ? s : null;
}

/**
 * Can an order be placed for delivery to this postcode now? (047 FR-001, rebuilt by 076.)
 *
 * ⚠ It asks `coverageForPostcode` — it has no join of its own — so the up-front answer, the address
 * book and the quote cannot disagree. True when Effy delivers, or (079) when a courier order can be
 * placed there: the coverage answer is "courier" only then.
 */
export async function serviceableForPostcode(q: Queryable, postcode: string): Promise<boolean> {
  return (await coverageForPostcode(q, postcode)).kind !== "none";
}
