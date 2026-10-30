import { PACK_UNIT_LABELS, type PackUnit, type UnitPriceDTO } from "@effy/shared-types";

/**
 * A product's size as the product page shows it, in either console. Each console maps its own DTO to this, so
 * the size views below never learn which audience they are drawn for (a shop never sees Effy's margin; staff do).
 */
export interface SizeView {
  id: string;
  label: string;
  /** Effy's permanent code; null for a size a pending change adds. */
  code: string | null;
  sku: string | null;
  gtin: string | null;
  /** Its net quantity ("750", "mL"), when it has one. */
  quantity: { amount: string; unit: string } | null;
  weightGrams: number;
  weightAssumed: boolean;
  shopPrice: string;
  /** Null until the product is first approved. */
  customerPrice: string | null;
  /** A shop price waiting for Effy's review, when it differs from the live one. */
  pendingShopPrice: string | null;
  unitPrice: UnitPriceDTO | null;
  onSale: boolean;
  stock: SizeStock;
}

export interface SizeStock {
  /** false: nobody counts it, so it never runs out. */
  tracked: boolean;
  onHand: number | null;
  /** The level the shop is told at (its own, else the shop default); null when nothing counts as low. */
  alertAt: number | null;
  low: boolean;
  out: boolean;
}

export type StockState = "untracked" | "ok" | "low" | "out";

export function stockState(s: SizeStock): StockState {
  if (!s.tracked) return "untracked";
  if (s.out) return "out";
  if (s.low) return "low";
  return "ok";
}

export const STOCK_STATE_WORDS: Record<StockState, string> = {
  untracked: "Not counted",
  ok: "In stock",
  low: "Low",
  out: "Out of stock",
};

/** A net quantity as the size's mark shows it: "750" over "mL". */
export function quantityOf(amount: string | null, unit: PackUnit | string | null): SizeView["quantity"] {
  if (!amount || !unit) return null;
  return { amount: String(Number(amount)), unit: PACK_UNIT_LABELS[unit as PackUnit] ?? unit };
}

/** The share of a full gauge a count fills: four alert levels is full, so the alert mark sits a quarter along. */
export function gaugeShare(s: SizeStock): { fill: number; mark: number | null } {
  const span = Math.max((s.alertAt ?? 0) * 4, s.onHand ?? 0, 1);
  return {
    fill: Math.min(100, ((s.onHand ?? 0) / span) * 100),
    mark: s.alertAt !== null ? Math.min(100, (s.alertAt / span) * 100) : null,
  };
}

export const weightText = (grams: number) =>
  grams >= 1000 ? `${(grams / 1000).toFixed(2).replace(/\.?0+$/, "")} kg` : `${grams} g`;

/**
 * Each size's unit price against the most expensive one, for the ladder; null when fewer than two sizes have a
 * unit price on the same basis (there is nothing to compare).
 */
export function unitLadder(
  sizes: readonly SizeView[],
): { id: string; label: string; unit: UnitPriceDTO; share: number }[] | null {
  const priced = sizes.filter((s) => s.unitPrice !== null);
  if (priced.length < 2) return null;
  const basis = priced[0]!.unitPrice!.basis;
  if (priced.some((s) => s.unitPrice!.basis !== basis)) return null;
  const max = Math.max(...priced.map((s) => Number(s.unitPrice!.amount)));
  if (!(max > 0)) return null;
  return priced.map((s) => ({
    id: s.id,
    label: s.label,
    unit: s.unitPrice!,
    share: (Number(s.unitPrice!.amount) / max) * 100,
  }));
}

/** One thing a listing should have, and whether it does. */
export interface QualityItem {
  key: string;
  label: string;
  ok: boolean;
  /** Without it the product cannot go on sale or a change cannot be sent. */
  required?: boolean;
  /** Not a fault, but worth a look (a size on sale with nothing in stock). */
  attention?: boolean;
  /** What is wrong, in a few words ("1 missing", "2 of 3"). */
  note?: string;
  /** The section it is fixed in. */
  section?: string;
}
