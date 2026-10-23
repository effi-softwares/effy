/**
 * Unit pricing. A product says how its sizes are compared (`UnitBasis`: per 100 g, per kg, per 100 mL,
 * per L, each); each variant says how much is in its pack. The comparison price is the price scaled to
 * the basis ($3.20 for 500 g → $0.64 / 100 g), as the Unit Pricing Code asks.
 *
 * One sum, here: the server computes `UnitPriceDTO`; clients only format it (`unitPriceText`), the app's
 * Kotlin formatter pinned to `unit-price.fixtures.json`. Integer arithmetic: whole cents, quantities in
 * thousandths, one half-up rounding at the end.
 */

export type UnitBasis = "per_100g" | "per_kg" | "per_100ml" | "per_l" | "each"
export type PackUnit = "g" | "kg" | "ml" | "l" | "each"

export const UNIT_BASES: readonly UnitBasis[] = ["per_100g", "per_kg", "per_100ml", "per_l", "each"]
export const PACK_UNITS: readonly PackUnit[] = ["g", "kg", "ml", "l", "each"]

/** A server-computed comparison price. `amount` is a 2-dp money string, like every price on the wire. */
export interface UnitPriceDTO {
  amount: string
  basis: UnitBasis
}

/** What the basis is measured in, and how many of those units it covers. */
const BASIS: Record<UnitBasis, { dimension: "mass" | "volume" | "count"; base: number }> = {
  per_100g: { dimension: "mass", base: 100 }, // grams
  per_kg: { dimension: "mass", base: 1000 },
  per_100ml: { dimension: "volume", base: 100 }, // millilitres
  per_l: { dimension: "volume", base: 1000 },
  each: { dimension: "count", base: 1 },
}

/** A pack unit in the dimension's base unit (g, mL or one item). */
const PACK: Record<PackUnit, { dimension: "mass" | "volume" | "count"; factor: number }> = {
  g: { dimension: "mass", factor: 1 },
  kg: { dimension: "mass", factor: 1000 },
  ml: { dimension: "volume", factor: 1 },
  l: { dimension: "volume", factor: 1000 },
  each: { dimension: "count", factor: 1 },
}

/** g/kg go with the weight bases, mL/L with the volume bases, "each" with "each". */
export function packUnitCompatible(basis: UnitBasis, unit: PackUnit): boolean {
  return BASIS[basis].dimension === PACK[unit].dimension
}

/** "1.25" → 1250 (thousandths). Refuses anything but a positive decimal with at most 3 places. */
export function packQuantityThousandths(quantity: string | number): number | null {
  const text = typeof quantity === "number" ? String(quantity) : quantity.trim()
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return null
  const [whole, frac = ""] = text.split(".")
  const n = Number(whole) * 1000 + Number((frac + "000").slice(0, 3))
  return n > 0 && Number.isSafeInteger(n) ? n : null
}

/**
 * The comparison price in whole cents, or null when it cannot be computed (no pack size, an
 * incompatible unit, a malformed quantity).
 *
 *  unit = price × basisBase ÷ (quantity × unitFactor) rounded half up, once
 */
export function unitPriceCents(
  priceCents: number,
  packQuantity: string | number | null | undefined,
  packUnit: PackUnit | null | undefined,
  basis: UnitBasis | null | undefined,
): number | null {
  if (packQuantity === null || packQuantity === undefined || !packUnit || !basis) return null
  if (!Number.isInteger(priceCents) || priceCents < 0) return null
  if (!packUnitCompatible(basis, packUnit)) return null
  const q = packQuantityThousandths(packQuantity)
  if (q === null) return null
  // price × base × 1000 / (q × factor), with q already ×1000. `BigInt(n)`, not `n` literals: customer-web
  // compiles below ES2020.
  const numerator = BigInt(priceCents) * BigInt(BASIS[basis].base) * BigInt(1000)
  const denominator = BigInt(q) * BigInt(PACK[packUnit].factor)
  const two = BigInt(2)
  return Number((numerator * two + denominator) / (denominator * two)) // half up
}

/** Convenience over money strings — what the server's mappers hold. */
export function unitPrice(
  priceAmount: string | null | undefined,
  packQuantity: string | number | null | undefined,
  packUnit: PackUnit | null | undefined,
  basis: UnitBasis | null | undefined,
): UnitPriceDTO | null {
  if (!priceAmount || !basis) return null
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(priceAmount.trim())
  if (!m) return null
  const cents = Number(m[1]) * 100 + Number(((m[2] ?? "") + "00").slice(0, 2))
  const out = unitPriceCents(cents, packQuantity, packUnit, basis)
  if (out === null) return null
  return { amount: `${Math.floor(out / 100)}.${String(out % 100).padStart(2, "0")}`, basis }
}

/** The words after the amount; the app's `UnitBasisWords` is held to them by `unit-price.fixtures.json`. */
export const UNIT_BASIS_WORDS: Record<UnitBasis, string> = {
  per_100g: "/ 100 g",
  per_kg: "/ kg",
  per_100ml: "/ 100 mL",
  per_l: "/ L",
  each: "each",
}

/** "$0.64 / 100 g", "$0.60 each". */
export function unitPriceText(u: UnitPriceDTO): string {
  return `$${u.amount} ${UNIT_BASIS_WORDS[u.basis]}`
}

/** How a shop console names a basis in its picker. */
export const UNIT_BASIS_LABELS: Record<UnitBasis, string> = {
  per_100g: "Per 100 g",
  per_kg: "Per kg",
  per_100ml: "Per 100 mL",
  per_l: "Per litre",
  each: "Each",
}

export const PACK_UNIT_LABELS: Record<PackUnit, string> = {
  g: "g",
  kg: "kg",
  ml: "mL",
  l: "L",
  each: "each",
}
