import {
  optionCombinations,
  PACK_UNITS,
  packUnitCompatible,
  unitPrice,
  validateVariantSet,
  variantLabel,
  type CategoryFormRow,
  type DetailVariant,
  type OptionInputDTO,
  type OptionValueIds,
  type PackUnit,
  type ProductDetailDTO,
  type ShopVariantDTO,
  type UnitBasis,
  type UnitPriceDTO,
  type VariantInputDTO,
} from "@effy/shared-types";

export interface VariantRowDraft {
  id: string;
  code: string | null;
  position: number;
  optionValueIds: OptionValueIds;
  sku: string;
  gtin: string;
  shopPriceAmount: string;
  shopCompareAtAmount: string;
  weightGrams: string;
  /** The variant's net quantity (how much is in the pack), for unit pricing. */
  packQuantity: string;
  packUnit: "" | PackUnit;
  mediaStorageKey: string | null;
}

export interface VariantSetDraft {
  unitBasis: "" | UnitBasis;
  /** The category's variant-option attributes the product uses (105: no other kind of option). */
  options: OptionInputDTO[];
  variants: VariantRowDraft[];
}

export function newId(): string {
  return crypto.randomUUID();
}

export function emptyRow(
  position: number,
  optionValueIds: OptionValueIds = [null, null],
): VariantRowDraft {
  return {
    id: newId(),
    code: null,
    position,
    optionValueIds,
    sku: "",
    gtin: "",
    shopPriceAmount: "",
    shopCompareAtAmount: "",
    weightGrams: "",
    packQuantity: "",
    packUnit: "",
    mediaStorageKey: null,
  };
}

export function emptyVariantSet(): VariantSetDraft {
  return { unitBasis: "", options: [], variants: [emptyRow(0)] };
}

export interface LabelledOption {
  id: string;
  position: number;
  attributeId: string;
  name: string;
  values: {
    id: string;
    value: string;
    position: number;
    allowedValueId: string;
  }[];
}

/** The options with names and value labels, from the category's form. */
export function labelledOptions(
  set: Pick<VariantSetDraft, "options">,
  rows: readonly CategoryFormRow[],
): LabelledOption[] {
  const byAttr = new Map(rows.map((r) => [r.attributeId, r]));
  return [...set.options]
    .sort((a, b) => a.position - b.position)
    .map((o) => {
      const row = byAttr.get(o.attributeId);
      return {
        id: o.id,
        position: o.position,
        attributeId: o.attributeId,
        name: row?.name ?? "Option",
        values: [...o.values]
          .sort((a, b) => a.position - b.position)
          .map((v) => ({
            ...v,
            value:
              row?.values.find((x) => x.id === v.allowedValueId)?.label ??
              "A value no longer offered",
          })),
      };
    });
}

/** The category's attributes a shop may build variants from - the only options there are (105). */
export function optionAttributes(
  rows: readonly CategoryFormRow[],
): CategoryFormRow[] {
  return rows.filter((r) => r.variantOption && r.values.length > 0);
}

/** Active variants as the details rules need them: id and label. */
export function variantLabels(
  set: VariantSetDraft,
  rows: readonly CategoryFormRow[],
): DetailVariant[] {
  const options = labelledOptions(set, rows);
  return set.variants.map((r) => ({
    id: r.id,
    label: variantLabel(options, r.optionValueIds) ?? "This variant",
  }));
}

const key = (ids: OptionValueIds) => `${ids[0] ?? ""}|${ids[1] ?? ""}`;
const valueIdsOf = (options: readonly OptionInputDTO[]) =>
  new Set(options.flatMap((o) => o.values.map((v) => v.id)));

export function syncRows(
  prev: readonly OptionInputDTO[],
  next: readonly OptionInputDTO[],
  rows: readonly VariantRowDraft[],
): VariantRowDraft[] {
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
      const parent =
        prev.length === 0
          ? rows[0]
          : rows.find((r) => r.optionValueIds[0] === ids[0]);
      if (parent && !reused.has(parent.id)) {
        out.push({ ...parent, optionValueIds: ids });
        reused.add(parent.id);
      } else if (parent) {
        out.push({
          ...parent,
          id: newId(),
          code: null,
          sku: "",
          gtin: "",
          mediaStorageKey: parent.mediaStorageKey,
          optionValueIds: ids,
        });
      } else {
        out.push(emptyRow(0, ids));
      }
      continue;
    }
    if (ids.some((id) => id !== null && !oldValues.has(id)))
      out.push(emptyRow(0, ids));
  }
  if (out.length === 0) out.push(emptyRow(0));
  return out.map((r, i) => ({ ...r, position: i }));
}

export function addMissingRows(set: VariantSetDraft): VariantRowDraft[] {
  const have = new Set(set.variants.map((r) => key(r.optionValueIds)));
  const missing = optionCombinations(set.options).filter(
    (ids) => !have.has(key(ids)),
  );
  return [
    ...set.variants,
    ...missing.map((ids, i) => emptyRow(set.variants.length + i, ids)),
  ].map((r, i) => ({
    ...r,
    position: i,
  }));
}

export function applyToAll(
  set: VariantSetDraft,
  field: "shopPriceAmount" | "weightGrams",
): VariantRowDraft[] {
  const first = set.variants[0];
  if (!first) return set.variants;
  return set.variants.map((r) => ({ ...r, [field]: first[field] }));
}

export function rowLabel(
  set: Pick<VariantSetDraft, "options">,
  row: Pick<VariantRowDraft, "optionValueIds">,
  rows: readonly CategoryFormRow[],
): string {
  return (
    variantLabel(labelledOptions(set, rows), row.optionValueIds) ??
    "The product"
  );
}

/** A row's net quantity as sent: always the variant's own (105). */
export function rowPack(
  _set: VariantSetDraft,
  row: VariantRowDraft,
): { packQuantity: string; packUnit: "" | PackUnit } {
  return { packQuantity: row.packQuantity, packUnit: row.packUnit };
}

const strOrNull = (s: string) => (s.trim() === "" ? null : s.trim());

export function toInputs(set: VariantSetDraft): {
  options: OptionInputDTO[];
  variants: VariantInputDTO[];
  unitBasis: UnitBasis | null;
} {
  const used = new Set(
    set.variants.flatMap((r) =>
      r.optionValueIds.filter((x): x is string => x !== null),
    ),
  );
  const options = set.options
    .map((o) => ({
      id: o.id,
      position: o.position,
      attributeId: o.attributeId,
      values: o.values
        .filter((v) => used.has(v.id))
        .map((v, i) => ({ id: v.id, allowedValueId: v.allowedValueId, position: i })),
    }))
    .filter((o) => o.values.length > 0)
    .map((o, i) => ({ ...o, position: i + 1 }));
  return {
    unitBasis: set.unitBasis === "" ? null : set.unitBasis,
    options,
    variants: set.variants.map((r, i) => {
      const pack = rowPack(set, r);
      return {
        id: r.id,
        position: i,
        optionValueIds: r.optionValueIds,
        sku: strOrNull(r.sku),
        gtin: strOrNull(r.gtin),
        shopPriceAmount: r.shopPriceAmount.trim(),
        shopCompareAtAmount: strOrNull(r.shopCompareAtAmount),
        weightGrams:
          r.weightGrams.trim() === "" ? null : Number(r.weightGrams.trim()),
        packQuantity: strOrNull(pack.packQuantity),
        packUnit: pack.packUnit === "" ? null : pack.packUnit,
        mediaStorageKey: r.mediaStorageKey,
      };
    }),
  };
}

export function variantSetErrors(set: VariantSetDraft): Record<string, string> {
  const { options, variants, unitBasis } = toInputs(set);
  const out: Record<string, string> = {};
  for (const e of validateVariantSet(options, variants, unitBasis))
    out[e.field] ??= e.message;
  // A weight typed as words would be sent as NaN: say so on the cell.
  set.variants.forEach((r, i) => {
    if (r.weightGrams.trim() !== "" && !/^\d+$/.test(r.weightGrams.trim()))
      out[`variants[${i}].weightGrams`] ??= "must be a whole number of grams";
  });
  return out;
}

export function variantSetValid(set: VariantSetDraft): boolean {
  return Object.keys(variantSetErrors(set)).length === 0;
}

export function unitsFor(basis: "" | UnitBasis): PackUnit[] {
  return basis === "" ? [...PACK_UNITS] : PACK_UNITS.filter((u) => packUnitCompatible(basis, u));
}

export function previewUnitPrice(
  set: VariantSetDraft,
  row: VariantRowDraft,
): UnitPriceDTO | null {
  const pack = rowPack(set, row);
  if (set.unitBasis === "" || pack.packUnit === "") return null;
  return unitPrice(
    row.shopPriceAmount.trim(),
    pack.packQuantity.trim(),
    pack.packUnit,
    set.unitBasis,
  );
}

function rowFromVariant(
  v: Pick<
    ShopVariantDTO,
    | "id"
    | "code"
    | "position"
    | "optionValueIds"
    | "sku"
    | "gtin"
    | "shopPriceAmount"
    | "shopCompareAtAmount"
    | "weightGrams"
    | "weightIsAssumed"
    | "packQuantity"
    | "packUnit"
  >,
  mediaKey: string | null,
): VariantRowDraft {
  return {
    id: v.id,
    code: v.code,
    position: v.position,
    optionValueIds: [v.optionValueIds[0] ?? null, v.optionValueIds[1] ?? null],
    sku: v.sku ?? "",
    gtin: v.gtin ?? "",
    shopPriceAmount: v.shopPriceAmount,
    shopCompareAtAmount: v.shopCompareAtAmount ?? "",
    weightGrams: v.weightIsAssumed ? "" : String(v.weightGrams),
    packQuantity: v.packQuantity ?? "",
    packUnit: v.packUnit ?? "",
    mediaStorageKey: mediaKey,
  };
}

/** The editor's draft of a set sent as form inputs (a proposal, or Effy's own product's content, 102). */
export function variantSetDraftOf(
  options: readonly OptionInputDTO[],
  variants: readonly VariantInputDTO[],
  unitBasis: string | null,
  codes: ReadonlyMap<string, string | null> = new Map(),
): VariantSetDraft {
  return {
    unitBasis: (unitBasis ?? "") as VariantSetDraft["unitBasis"],
    options: [...options],
    variants: variants.map((v, i) => ({
      id: v.id,
      code: codes.get(v.id) ?? null,
      position: i,
      optionValueIds: [v.optionValueIds[0] ?? null, v.optionValueIds[1] ?? null],
      sku: v.sku ?? "",
      gtin: v.gtin ?? "",
      shopPriceAmount: v.shopPriceAmount,
      shopCompareAtAmount: v.shopCompareAtAmount ?? "",
      weightGrams: v.weightGrams == null ? "" : String(v.weightGrams),
      packQuantity: v.packQuantity ?? "",
      packUnit: v.packUnit ?? "",
      mediaStorageKey: v.mediaStorageKey ?? null,
    })),
  };
}

export function draftFromDetail(detail: ProductDetailDTO): VariantSetDraft {
  const proposed = detail.pendingChange?.proposed;
  const basis =
    proposed && "unitBasis" in proposed
      ? (proposed.unitBasis ?? null)
      : detail.unitBasis;
  if (proposed?.options && proposed.variants) {
    const codes = new Map(detail.variants.map((v) => [v.id, v.code]));
    return variantSetDraftOf(proposed.options, proposed.variants, basis ?? null, codes);
  }
  const mediaKey = (id: string | null) =>
    id ? (detail.media.find((m) => m.id === id)?.storageKey ?? null) : null;
  const options: OptionInputDTO[] = detail.options.map((o) => ({
    id: o.id,
    position: o.position,
    attributeId: o.attributeId,
    values: o.values.map((v) => ({
      id: v.id,
      allowedValueId: v.allowedValueId,
      position: v.position,
    })),
  }));
  const live = detail.variants.filter((v) => v.state !== "removed");
  return {
    unitBasis: basis ?? "",
    options,
    variants: live.map((v) => rowFromVariant(v, mediaKey(v.mediaId))),
  };
}

export function sizeLabelOf(
  detail: Pick<ProductDetailDTO, "variants">,
  variantId: string,
): string | null {
  const live = detail.variants.filter((v) => v.state !== "removed");
  if (live.length <= 1) return null;
  return live.find((v) => v.id === variantId)?.label ?? null;
}

export function defaultStockVariantId(
  detail: Pick<ProductDetailDTO, "variants">,
): string | null {
  const live = detail.variants.filter((v) => v.state !== "removed");
  return (live.find((v) => v.state === "active") ?? live[0])?.id ?? null;
}

export function shopPriceSummary(detail: Pick<ProductDetailDTO, "variants">): {
  amount: string | null;
  varies: boolean;
} {
  const active = detail.variants.filter((v) => v.state === "active");
  if (active.length === 0) return { amount: null, varies: false };
  const prices = active.map((v) => Number(v.shopPriceAmount));
  const min = Math.min(...prices);
  return {
    amount: active.find((v) => Number(v.shopPriceAmount) === min)!
      .shopPriceAmount,
    varies: new Set(prices).size > 1,
  };
}
