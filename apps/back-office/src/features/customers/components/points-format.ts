/** A positive whole number of points from a text field, or null. Commas and spaces are allowed. */
export function parsePoints(text: string): number | null {
  const t = text.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n > 0 && n <= 1_000_000 ? n : null;
}

/** "$5.00" for 500 points at one cent each. */
export function formatPointsValue(points: number, centsPerPoint: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", currencyDisplay: "narrowSymbol" }).format(
    (points * centsPerPoint) / 100,
  );
}

/** "1,250" — and a sign when asked, for history lines. */
export function formatPoints(points: number, signed = false): string {
  const s = Math.abs(points).toLocaleString("en-AU");
  return signed ? `${points < 0 ? "−" : "+"}${s}` : s;
}

/** "8 Oct 2027" from a yyyy-mm-dd Melbourne date. */
export function formatDay(ymd: string): string {
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "Australia/Melbourne" }).format(new Date(`${ymd}T12:00:00+10:00`));
}
