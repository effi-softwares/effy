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

