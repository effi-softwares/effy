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
} from "@effy/shared-types"

export interface VariantRowDraft {
  id: string
  code: string | null
  position: number
  optionValueIds: OptionValueIds
  sku: string
  gtin: string
  shopPriceAmount: string
  shopCompareAtAmount: string
  weightGrams: string
  packQuantity: string
  packUnit: "" | PackUnit
  mediaStorageKey: string | null
}

export interface VariantSetDraft {
  unitBasis: "" | UnitBasis
  options: OptionInputDTO[]
  variants: VariantRowDraft[]
}

export function newId(): string {
  return crypto.randomUUID()
}

export function emptyRow(position: number, optionValueIds: OptionValueIds = [null, null]): VariantRowDraft {
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
  }
}

export function emptyVariantSet(): VariantSetDraft {
  return { unitBasis: "", options: [], variants: [emptyRow(0)] }
}

const key = (ids: OptionValueIds) => `${ids[0] ?? ""}|${ids[1] ?? ""}`
const valueIdsOf = (options: readonly OptionInputDTO[]) => new Set(options.flatMap((o) => o.values.map((v) => v.id)))

export function syncRows(
  prev: readonly OptionInputDTO[],
  next: readonly OptionInputDTO[],
  rows: readonly VariantRowDraft[],
): VariantRowDraft[] {
  const byKey = new Map(rows.map((r) => [key(r.optionValueIds), r]))
  const oldValues = valueIdsOf(prev)
  const countChanged = prev.length !== next.length
  const reused = new Set<string>()
  const out: VariantRowDraft[] = []

  for (const ids of optionCombinations(next)) {
    const existing = byKey.get(key(ids))
    if (existing) {
      out.push(existing)
      reused.add(existing.id)
      continue
    }
    if (countChanged) {
      const parent = prev.length === 0 ? rows[0] : rows.find((r) => r.optionValueIds[0] === ids[0])
      if (parent && !reused.has(parent.id)) {
        out.push({ ...parent, optionValueIds: ids })
        reused.add(parent.id)
      } else if (parent) {
        out.push({
          ...parent,
          id: newId(),
          code: null,
          sku: "",
          gtin: "",
          mediaStorageKey: parent.mediaStorageKey,
          optionValueIds: ids,
        })
      } else {
        out.push(emptyRow(0, ids))
      }
      continue
    }
    if (ids.some((id) => id !== null && !oldValues.has(id))) out.push(emptyRow(0, ids))
  }
  if (out.length === 0) out.push(emptyRow(0))
  return out.map((r, i) => ({ ...r, position: i }))
}

export function addMissingRows(set: VariantSetDraft): VariantRowDraft[] {
  const have = new Set(set.variants.map((r) => key(r.optionValueIds)))
  const missing = optionCombinations(set.options).filter((ids) => !have.has(key(ids)))
  return [...set.variants, ...missing.map((ids, i) => emptyRow(set.variants.length + i, ids))].map((r, i) => ({
    ...r,
    position: i,
  }))
}

export function applyToAll(set: VariantSetDraft, field: "shopPriceAmount" | "weightGrams"): VariantRowDraft[] {
  const first = set.variants[0]
  if (!first) return set.variants
  return set.variants.map((r) => ({ ...r, [field]: first[field] }))
}

export function rowLabel(set: Pick<VariantSetDraft, "options">, row: Pick<VariantRowDraft, "optionValueIds">): string {
  return variantLabel(set.options, row.optionValueIds) ?? "The product"
}

const strOrNull = (s: string) => (s.trim() === "" ? null : s.trim())

export function toInputs(set: VariantSetDraft): {
  options: OptionInputDTO[]
  variants: VariantInputDTO[]
  unitBasis: UnitBasis | null
} {
  const used = new Set(set.variants.flatMap((r) => r.optionValueIds.filter((x): x is string => x !== null)))
  const options = set.options
    .map((o) => ({
      ...o,
      name: o.name.trim(),
      values: o.values.filter((v) => used.has(v.id)).map((v, i) => ({ ...v, value: v.value.trim(), position: i })),
    }))
    .filter((o) => o.values.length > 0)
    .map((o, i) => ({ ...o, position: i + 1 }))
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
  }
}

export function variantSetErrors(set: VariantSetDraft): Record<string, string> {
  const { options, variants, unitBasis } = toInputs(set)
  const out: Record<string, string> = {}
  for (const e of validateVariantSet(options, variants, unitBasis)) out[e.field] ??= e.message
  // A weight typed as words would be sent as NaN: say so on the cell.
  set.variants.forEach((r, i) => {
    if (r.weightGrams.trim() !== "" && !/^\d+$/.test(r.weightGrams.trim()))
      out[`variants[${i}].weightGrams`] ??= "must be a whole number of grams"
  })
  return out
}

export function variantSetValid(set: VariantSetDraft): boolean {
  return Object.keys(variantSetErrors(set)).length === 0
}

export function unitsFor(basis: "" | UnitBasis): PackUnit[] {
  const all: PackUnit[] = ["g", "kg", "ml", "l", "each"]
  return basis === "" ? all : all.filter((u) => packUnitCompatible(basis, u))
}

export function previewUnitPrice(set: VariantSetDraft, row: VariantRowDraft): UnitPriceDTO | null {
  if (set.unitBasis === "" || row.packUnit === "") return null
  return unitPrice(row.shopPriceAmount.trim(), row.packQuantity.trim(), row.packUnit, set.unitBasis)
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
  }
}

export function draftFromDetail(detail: ProductDetailDTO): VariantSetDraft {
  const proposed = detail.pendingChange?.proposed
  const basis = proposed && "unitBasis" in proposed ? (proposed.unitBasis ?? null) : detail.unitBasis
  if (proposed?.options && proposed.variants) {
    const codes = new Map(detail.variants.map((v) => [v.id, v.code]))
    return {
      unitBasis: basis ?? "",
      options: proposed.options,
      variants: proposed.variants.map((v, i) => ({
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
    }
  }
  const mediaKey = (id: string | null) => (id ? (detail.media.find((m) => m.id === id)?.storageKey ?? null) : null)
  return {
    unitBasis: basis ?? "",
    options: detail.options.map((o) => ({ id: o.id, position: o.position, name: o.name, values: o.values })),
    variants: detail.variants.filter((v) => v.state !== "removed").map((v) => rowFromVariant(v, mediaKey(v.mediaId))),
  }
}

export function sizeLabelOf(detail: Pick<ProductDetailDTO, "variants">, variantId: string): string | null {
  const live = detail.variants.filter((v) => v.state !== "removed")
  if (live.length <= 1) return null
  return live.find((v) => v.id === variantId)?.label ?? null
}

export function defaultStockVariantId(detail: Pick<ProductDetailDTO, "variants">): string | null {
  const live = detail.variants.filter((v) => v.state !== "removed")
  return (live.find((v) => v.state === "active") ?? live[0])?.id ?? null
}

export function shopPriceSummary(detail: Pick<ProductDetailDTO, "variants">): {
  amount: string | null
  varies: boolean
} {
  const active = detail.variants.filter((v) => v.state === "active")
  if (active.length === 0) return { amount: null, varies: false }
  const prices = active.map((v) => Number(v.shopPriceAmount))
  const min = Math.min(...prices)
  return {
    amount: active.find((v) => Number(v.shopPriceAmount) === min)!.shopPriceAmount,
    varies: new Set(prices).size > 1,
  }
}
