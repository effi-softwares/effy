import {
  optionCombinations,
  packUnitCompatible,
  unitPrice,
  validateVariantSet,
  variantLabel,
  type OptionInputDTO,
  type OptionValueIds,
  type PackUnit,
  type ProductDetailDTO,
  type ShopVariantDTO,
  type UnitBasis,
  type UnitPriceDTO,
  type VariantInputDTO,
} from "@effy/shared-types";

/**
 * Sizes and options (098) — the shop console's half, pure (no React, no I/O).
 *
 * A product's options ("Size", "Flavour") and its variants (one per combination the shop sells) are
 * edited as ONE set and sent whole. The rules a set must meet are `validateVariantSet` from
 * @effy/shared-types — the SAME function the server runs inside its one writer — so a refusal shown
 * here is a refusal the server would give, in the same words, on the same cell.
 */

/** One variant row as typed: every field a string, so "" survives as "not answered". */
export interface VariantRowDraft {
  id: string;
  position: number;
  optionValueIds: OptionValueIds;
  sku: string;
  gtin: string;
  shopPriceAmount: string;
  shopCompareAtAmount: string;
  /** Grams; "" = not supplied (the platform records its default as an assumption, 032). */
  weightGrams: string;
  packQuantity: string;
  packUnit: "" | PackUnit;
  mediaStorageKey: string | null;
}

export interface VariantSetDraft {
  unitBasis: "" | UnitBasis;
  options: OptionInputDTO[];
  variants: VariantRowDraft[];
}

/** Client-generated ids (R6): the proposal, the reviewer and approval all name the same row. */
export function newId(): string {
  return crypto.randomUUID();
}

export function emptyRow(position: number, optionValueIds: OptionValueIds = [null, null]): VariantRowDraft {
  return {
    id: newId(), position, optionValueIds, sku: "", gtin: "", shopPriceAmount: "", shopCompareAtAmount: "",
    weightGrams: "", packQuantity: "", packUnit: "", mediaStorageKey: null,
  };
}

/** A new product: no options, one variant. */
export function emptyVariantSet(): VariantSetDraft {
  return { unitBasis: "", options: [], variants: [emptyRow(0)] };
}

const key = (ids: OptionValueIds) => `${ids[0] ?? ""}|${ids[1] ?? ""}`;
const valueIdsOf = (options: readonly OptionInputDTO[]) => new Set(options.flatMap((o) => o.values.map((v) => v.id)));

/**
 * Bring the rows in line with edited options.
 *
 * - A row whose combination no longer exists is dropped.
 * - When the NUMBER of options changes, every combination is laid out again; a row keeps its price,
 *   codes and weight when its first value is still there (adding "Flavour" to sized rows carries each
 *   size's price to every flavour of it).
 * - A new VALUE brings its combinations in. A combination the shop deleted earlier is NOT brought back
 *   just because another option changed — only "Add missing combinations" does that.
 */
export function syncRows(prev: readonly OptionInputDTO[], next: readonly OptionInputDTO[], rows: readonly VariantRowDraft[]): VariantRowDraft[] {
  const byKey = new Map(rows.map((r) => [key(r.optionValueIds), r]));
  const oldValues = valueIdsOf(prev);
  const countChanged = prev.length !== next.length;
  const reused = new Set<string>();
  const out: VariantRowDraft[] = [];

  for (const ids of optionCombinations(next)) {
    const existing = byKey.get(key(ids));
    if (existing) {
      out.push(existing);
      reused.add(existing.id);
      continue;
    }
    if (countChanged) {
      // The row this combination grew out of: same first value, or the only row of an option-less product.
      const parent = prev.length === 0 ? rows[0] : rows.find((r) => r.optionValueIds[0] === ids[0]);
      if (parent && !reused.has(parent.id)) {
        // The first copy IS the parent (it keeps its id, so its stock and history stay with it).
        out.push({ ...parent, optionValueIds: ids });
        reused.add(parent.id);
      } else if (parent) {
        // Further copies take its prices and weight, but not its codes (a code names one item).
        out.push({ ...parent, id: newId(), sku: "", gtin: "", mediaStorageKey: parent.mediaStorageKey, optionValueIds: ids });
      } else {
        out.push(emptyRow(0, ids));
      }
      continue;
    }
    // Same options, a new value: its combinations come in, empty. Old combinations the shop deleted stay deleted.
    if (ids.some((id) => id !== null && !oldValues.has(id))) out.push(emptyRow(0, ids));
  }
  if (out.length === 0) out.push(emptyRow(0));
  return out.map((r, i) => ({ ...r, position: i }));
}

/** Rows for every combination the options allow that has none yet. */
export function addMissingRows(set: VariantSetDraft): VariantRowDraft[] {
  const have = new Set(set.variants.map((r) => key(r.optionValueIds)));
  const missing = optionCombinations(set.options).filter((ids) => !have.has(key(ids)));
  return [...set.variants, ...missing.map((ids, i) => emptyRow(set.variants.length + i, ids))].map((r, i) => ({ ...r, position: i }));
}

export function rowLabel(set: Pick<VariantSetDraft, "options">, row: Pick<VariantRowDraft, "optionValueIds">): string {
  return variantLabel(set.options, row.optionValueIds) ?? "The product";
}

const strOrNull = (s: string) => (s.trim() === "" ? null : s.trim());

/**
 * The wire shapes. Option values no variant uses are dropped (the server refuses them as noise in a
 * shopper's selector), and an option left with no value goes with them.
 */
export function toInputs(set: VariantSetDraft): { options: OptionInputDTO[]; variants: VariantInputDTO[]; unitBasis: UnitBasis | null } {
  const used = new Set(set.variants.flatMap((r) => r.optionValueIds.filter((x): x is string => x !== null)));
  const options = set.options
    .map((o) => ({
      ...o,
      name: o.name.trim(),
      values: o.values.filter((v) => used.has(v.id)).map((v, i) => ({ ...v, value: v.value.trim(), position: i })),
    }))
    .filter((o) => o.values.length > 0)
    .map((o, i) => ({ ...o, position: i + 1 }));
  return {
    unitBasis: set.unitBasis === "" ? null : set.unitBasis,
    options,
    variants: set.variants.map((r, i) => ({
      id: r.id,
      position: i,
      optionValueIds: r.optionValueIds,
      sku: strOrNull(r.sku),
      gtin: strOrNull(r.gtin),
      shopPriceAmount: r.shopPriceAmount.trim(),
      shopCompareAtAmount: strOrNull(r.shopCompareAtAmount),
      weightGrams: r.weightGrams.trim() === "" ? null : Number(r.weightGrams.trim()),
      packQuantity: strOrNull(r.packQuantity),
      packUnit: r.packUnit === "" ? null : r.packUnit,
      mediaStorageKey: r.mediaStorageKey,
    })),
  };
}

/** Every refusal, keyed by the server's own field paths (`variants[2].shopPriceAmount`). */
export function variantSetErrors(set: VariantSetDraft): Record<string, string> {
  const { options, variants, unitBasis } = toInputs(set);
  const out: Record<string, string> = {};
  for (const e of validateVariantSet(options, variants, unitBasis)) out[e.field] ??= e.message;
  // A weight typed as words would be sent as NaN: say so on the cell.
  set.variants.forEach((r, i) => {
    if (r.weightGrams.trim() !== "" && !/^\d+$/.test(r.weightGrams.trim())) out[`variants[${i}].weightGrams`] ??= "must be a whole number of grams";
  });
  return out;
}

export function variantSetValid(set: VariantSetDraft): boolean {
  return Object.keys(variantSetErrors(set)).length === 0;
}

/** The units a basis accepts — the pack-unit picker offers only these. */
export function unitsFor(basis: "" | UnitBasis): PackUnit[] {
  const all: PackUnit[] = ["g", "kg", "ml", "l", "each"];
  return basis === "" ? all : all.filter((u) => packUnitCompatible(basis, u));
}

/** The comparison price a row would show shoppers at its SHOP price (a preview; Effy's margin adds to it). */
export function previewUnitPrice(set: VariantSetDraft, row: VariantRowDraft): UnitPriceDTO | null {
  if (set.unitBasis === "" || row.packUnit === "") return null;
  return unitPrice(row.shopPriceAmount.trim(), row.packQuantity.trim(), row.packUnit, set.unitBasis);
}

// ── From the server ────────────────────────────────────────────────────────────────────────────

function rowFromVariant(v: Pick<ShopVariantDTO, "id" | "position" | "optionValueIds" | "sku" | "gtin" | "shopPriceAmount" | "shopCompareAtAmount" | "weightGrams" | "weightIsAssumed" | "packQuantity" | "packUnit">, mediaKey: string | null): VariantRowDraft {
  return {
    id: v.id,
    position: v.position,
    optionValueIds: [v.optionValueIds[0] ?? null, v.optionValueIds[1] ?? null],
    sku: v.sku ?? "",
    gtin: v.gtin ?? "",
    shopPriceAmount: v.shopPriceAmount,
    shopCompareAtAmount: v.shopCompareAtAmount ?? "",
    // ⚠ Seeded BLANK when assumed: the operator answers "how heavy is it?", never confirms a guess.
    weightGrams: v.weightIsAssumed ? "" : String(v.weightGrams),
    packQuantity: v.packQuantity ?? "",
    packUnit: v.packUnit ?? "",
    mediaStorageKey: mediaKey,
  };
}

/**
 * The set as the shop last left it: the pending proposal's when there is one (067 — the editor opens
 * on the shop's own latest version), else the live one. Removed variants are history and not edited.
 */
export function draftFromDetail(detail: ProductDetailDTO): VariantSetDraft {
  const proposed = detail.pendingChange?.proposed;
  const basis = proposed && "unitBasis" in proposed ? proposed.unitBasis ?? null : detail.unitBasis;
  if (proposed?.options && proposed.variants) {
    return {
      unitBasis: basis ?? "",
      options: proposed.options,
      variants: proposed.variants.map((v, i) => ({
        id: v.id, position: i, optionValueIds: [v.optionValueIds[0] ?? null, v.optionValueIds[1] ?? null],
        sku: v.sku ?? "", gtin: v.gtin ?? "", shopPriceAmount: v.shopPriceAmount, shopCompareAtAmount: v.shopCompareAtAmount ?? "",
        weightGrams: v.weightGrams == null ? "" : String(v.weightGrams), packQuantity: v.packQuantity ?? "",
        packUnit: v.packUnit ?? "", mediaStorageKey: v.mediaStorageKey ?? null,
      })),
    };
  }
  const mediaKey = (id: string | null) => (id ? detail.media.find((m) => m.id === id)?.storageKey ?? null : null);
  return {
    unitBasis: basis ?? "",
    options: detail.options.map((o) => ({ id: o.id, position: o.position, name: o.name, values: o.values })),
    variants: detail.variants.filter((v) => v.state !== "removed").map((v) => rowFromVariant(v, mediaKey(v.mediaId))),
  };
}

/** The size whose stock a page opens on: the first on sale, else the first not removed. */
export function defaultStockVariantId(detail: Pick<ProductDetailDTO, "variants">): string | null {
  const live = detail.variants.filter((v) => v.state !== "removed");
  return (live.find((v) => v.state === "active") ?? live[0])?.id ?? null;
}

/** The lowest shop price among active variants, and whether they differ — the header's "From". */
export function shopPriceSummary(detail: Pick<ProductDetailDTO, "variants">): { amount: string | null; varies: boolean } {
  const active = detail.variants.filter((v) => v.state === "active");
  if (active.length === 0) return { amount: null, varies: false };
  const prices = active.map((v) => Number(v.shopPriceAmount));
  const min = Math.min(...prices);
  return { amount: active.find((v) => Number(v.shopPriceAmount) === min)!.shopPriceAmount, varies: new Set(prices).size > 1 };
}
