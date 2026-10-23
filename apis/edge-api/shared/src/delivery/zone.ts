const POSTCODE = /^[0-9]{4}$/;

/** Exactly four digits after trimming, else null: a malformed postcode is a 400, never "we don't deliver there". */
export function normalizePostcode(input: string): string | null {
  const s = input.trim();
  return POSTCODE.test(s) ? s : null;
}

