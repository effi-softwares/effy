// A variant's stock as an operator screen shows it (054, per variant since 098) — ONE mapping, used by
// the inventory service's stock screens and the shop's product detail grid, so "low" and "out" mean
// the same thing in both. Pure.
import type { ProductStockDTO } from "@effy/shared-types";

export interface StockFacts {
  productId: string;
  variantId: string;
  tracked: boolean;
  onHand: number | null;
  /** The variant's own threshold, or null. */
  threshold: number | null;
  shopDefaultThreshold: number | null;
}

/**
 * The threshold actually in force: the variant's own if set, else the shop's default, else none.
 *
 * ⚠ `null` means NOTHING counts as running low — it does NOT mean zero. A zero default would make
 * every variant permanently "low", which is the same as no signal at all. A variant at zero is still
 * reported, as `out`, by a separate rule (054 FR-005a).
 */
export function effectiveThreshold(f: Pick<StockFacts, "threshold" | "shopDefaultThreshold">): number | null {
  return f.threshold ?? f.shopDefaultThreshold ?? null;
}

export function stockState(f: StockFacts): ProductStockDTO {
  const threshold = effectiveThreshold(f);
  const onHand = f.tracked ? (f.onHand ?? 0) : null;
  return {
    productId: f.productId,
    variantId: f.variantId,
    tracked: f.tracked,
    onHand,
    threshold: f.threshold,
    effectiveThreshold: threshold,
    outOfStock: f.tracked && onHand === 0,
    // ⚠ `low` EXCLUDES zero on purpose. An empty shelf and a thin one need different actions —
    // restock now versus restock soon — and a row that claimed both would sort into two places.
    low: f.tracked && threshold !== null && onHand !== null && onHand > 0 && onHand <= threshold,
  };
}
