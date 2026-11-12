// A variant's stock as an operator screen shows it: one mapping for the inventory screens and the shop's product grid. Pure.
import type { ProductStockDTO } from "@effy/shared-types";

import { leftToSell } from "./availability";

export interface StockFacts {
  productId: string;
  variantId: string;
  tracked: boolean;
  onHand: number | null;
  /**
   * 114: units in shoppers' live checkout holds (`stockHeldSql`, no customer left out). Never changes `onHand`.
   * Ignored when untracked.
   */
  held: number;
  /** The variant's own threshold, or null. */
  threshold: number | null;
  shopDefaultThreshold: number | null;
}

/**
 * The threshold in force: the variant's own, else the shop's default, else none. `null` means nothing
 * counts as low (a zero default would make everything low); zero stock is still reported as `out`.
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
    held: f.tracked ? f.held : null,
    leftToSell: leftToSell(f.tracked, onHand, f.held),
    threshold: f.threshold,
    effectiveThreshold: threshold,
    outOfStock: f.tracked && onHand === 0,
    // `low` excludes zero: an empty shelf and a thin one need different actions. Both judge the shelf, not holds
    // (114 FR-018): they prompt restocking, and held units usually sell.
    low: f.tracked && threshold !== null && onHand !== null && onHand > 0 && onHand <= threshold,
  };
}
