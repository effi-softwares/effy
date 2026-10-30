/**
 * Cart totals for display, in integer cents. The server computes the amount charged. There is no
 * client-side delivery fee: delivery needs an address to price, so the cart says "Delivery calculated at
 * checkout".
 */
/**
 * Takes a structural shape rather than importing `GuestCartLine`: the cart store depends on this module,
 * and a type-only import back would still be a cycle.
 */
export interface PricedLine {
  unitPriceAmount: string
  quantity: number
}

export function parseCents(amount: string): number {
  const [whole, frac = ""] = amount.replace("-", "").split(".")
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2))
  return amount.startsWith("-") ? -cents : cents
}

export function formatCents(cents: number): string {
  const neg = cents < 0
  const abs = Math.abs(cents)
  return `${neg ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`
}

export interface CartTotals {
  /** Σ(unit×qty). The only amount the cart can know before an address is chosen. */
  itemSubtotal: string
}

/** Σ(unit×qty). Delivery is not included - it is quoted once for the order at checkout. */
export function computeCartTotals(lines: readonly PricedLine[]): CartTotals {
  const subtotal = lines.reduce((c, l) => c + parseCents(l.unitPriceAmount) * l.quantity, 0)
  return { itemSubtotal: formatCents(subtotal) }
}
