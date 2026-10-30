import { unitPriceText, type UnitPriceDTO } from "@effy/shared-types"

/**
 * The comparison price beside a price - "$0.64 / 100 g". Australian grocery shoppers compare
 * sizes by it, so it sits wherever a variant's price is shown: the card, the product page, the cart
 * line and the saved list.
 *
 * The platform computes it (`unitPriceCents`, whole cents, half up); this only says it, in the words
 * `UNIT_BASIS_WORDS` holds - the customer app's twin is pinned to the same fixtures. Nothing is shown
 * when the product has no unit basis or the size no pack quantity: a guessed comparison is worse than
 * none.
 */
export function UnitPrice({ unit, className = "" }: { unit: UnitPriceDTO | null | undefined; className?: string }) {
  if (!unit) return null
  return <span className={`text-xs text-muted-foreground tabular-nums ${className}`}>{unitPriceText(unit)}</span>
}
