/**
 * Client-side cart totals for DISPLAY (US3). Integer-cents math (never floats) mirroring core-api's
 * `money`/`pricing` packages. This is a display approximation for the guest cart review — the SERVER
 * recomputes the authoritative amount at checkout (FR-026), and the charge is always the server's.
 */
import type { GuestCartLine } from "./cart-store"

/** Flat per-order delivery fee (mirrors core-api pricing.DeliveryFeeCents = 500). */
export const DELIVERY_FEE_CENTS = 500

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
  itemSubtotal: string
  deliveryFee: string
  grandTotal: string
}

/** Σ(unit×qty) + a flat delivery fee (only when there is something to buy). */
export function computeCartTotals(lines: readonly GuestCartLine[]): CartTotals {
  const subtotal = lines.reduce((c, l) => c + parseCents(l.unitPriceAmount) * l.quantity, 0)
  const delivery = subtotal > 0 ? DELIVERY_FEE_CENTS : 0
  return {
    itemSubtotal: formatCents(subtotal),
    deliveryFee: formatCents(delivery),
    grandTotal: formatCents(subtotal + delivery),
  }
}
