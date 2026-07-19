/**
 * Money formatting for the storefront.
 *
 * Amounts cross the wire as decimal STRINGS + a currency (R9) — never floats. We parse once, at the
 * display edge, and format with Intl. All amounts are the single platform currency (AUD) this slice.
 */

/** Format a decimal-string amount for display, e.g. formatMoney("5", "AUD") → "$5.00". */
export function formatMoney(amount: string, currency: string): string {
  const n = Number(amount)
  if (!Number.isFinite(n)) return `${currency} ${amount}`
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency || "AUD",
    currencyDisplay: "narrowSymbol",
  }).format(n)
}

/** True when a compare-at price represents a genuine discount over the current price. */
export function isDiscounted(priceAmount: string, compareAtAmount: string | null): boolean {
  if (compareAtAmount == null) return false
  const price = Number(priceAmount)
  const compare = Number(compareAtAmount)
  return Number.isFinite(price) && Number.isFinite(compare) && compare > price
}

/** Human label for a product badge. */
export function badgeLabel(badge: string): string {
  switch (badge) {
    case "on_sale":
      return "Sale"
    case "new":
      return "New"
    default:
      return badge
  }
}
