/**
 * Client-side cart totals for DISPLAY. Integer-cents math (never floats) mirroring core-api's `money`
 * package. This is a display approximation for the guest cart review — the SERVER computes the
 * authoritative amount at checkout, and the charge is always the server's.
 *
 * 021: there is NO client-side delivery fee any more. Delivery is per-package, geographic, and needs
 * a destination address to price — so it is quoted only at the delivery step (FR-024/SC-010: no order
 * or package ever falls back to a flat/hardcoded fee). The cart shows the item subtotal and says
 * "Delivery calculated at checkout".
 */
import type { GuestCartLine } from "./cart-store"

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
  /** Σ(unit×qty). The ONLY amount the cart can know before an address is chosen (021). */
  itemSubtotal: string
}

/** Σ(unit×qty). Delivery is NOT included — it is quoted per package at checkout (021 FR-024). */
export function computeCartTotals(lines: readonly GuestCartLine[]): CartTotals {
  const subtotal = lines.reduce((c, l) => c + parseCents(l.unitPriceAmount) * l.quantity, 0)
  return { itemSubtotal: formatCents(subtotal) }
}
