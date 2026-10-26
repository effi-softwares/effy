/**
 * Product variants. A product is what a shopper recognises as one thing ("Basmati Rice"); its variants,
 * one per combination of up to two options (Flavour, Pack size), are what is bought, priced and counted. A
 * product with no options has one variant and no selector.
 *
 * Since 101 an option is never typed: it names a library attribute the leaf allows as a variant option
 * (Flavour, Colour, Size…), with values from that attribute's list, or it is "Pack size", whose values are
 * the variants' own pack sizes. The pure rules both ends need:
 *  • `variantLabel`: "Mango / 500 g", the one way a variant is named (order lines snapshot it);
 *  • `validateVariantSet` and `validateOptionsAgainstForm`: the shop console runs them before saving, and the
 *    one writer (`applyVariantSet`, @effy/edge-shared/catalog) runs the same functions.
 */

import type { WireInt } from "./cart"
import type { ProductStockDTO } from "./inventory"
import type { CategoryFormRow } from "./taxonomy"
import { PACK_UNIT_LABELS, PACK_UNITS, UNIT_BASES, packQuantityThousandths, packUnitCompatible, type PackUnit, type UnitBasis, type UnitPriceDTO } from "./unit-price"

export type VariantState = "active" | "inactive" | "removed"

export const VARIANT_LIMITS = {
  options: 2,
  valuesPerOption: 20,
  variants: 50,
} as const

export type OptionKind = "attribute" | "pack_size"

/** What a Pack size option is called. */
export const PACK_SIZE_OPTION_NAME = "Pack size"

/** `[position-1 value, position-2 value]`; null where the product has no such option. */
export type OptionValueIds = [string | null, string | null]

export interface OptionValueDTO {
  id: string
  /** The label shoppers see: the attribute value's label, or a pack size ("500 g"). */
  value: string
  position: WireInt
  /** The library value it is (attribute options); null for a pack size. */
  allowedValueId: string | null
}

export interface OptionDTO {
  id: string
  /** 1 or 2. */
  position: WireInt
  kind: OptionKind
  /** The library attribute (attribute options); null for Pack size. */
  attributeId: string | null
  /** The attribute's name, or "Pack size". */
  name: string
  values: OptionValueDTO[]
}

/** A labelled group of attribute rows on the product detail page (never laid out as cards). */
export interface ProductAttributeGroupDTO {
  groupLabel: string
  items: { label: string; value: string }[]
}

/** A shopper's view of one variant. Inactive and removed variants are never sent to shoppers. */
export interface StorefrontVariantDTO {
  id: string
  optionValueIds: OptionValueIds
  /** "Spiced / 500 g"; null when the product has no options. */
  label: string | null
  priceAmount: string
  compareAtAmount: string | null
  unitPrice: UnitPriceDTO | null
  /** Purchasable now (the one availability rule). */
  available: boolean
  /** The variant's own picture, or null — show the product's gallery. */
  imageUrl: string | null
  /** Widths (px) of this picture's smaller copies, ascending. */
  imageWidths?: number[]
  /** Customer-visible details for this variant (the product's merged with its own), grouped by section. */
  details: ProductAttributeGroupDTO[]
}

/** A shop's (and back-office's) view of one variant. */
export interface ShopVariantDTO {
  id: string
  position: WireInt
  optionValueIds: OptionValueIds
  label: string | null
  /** Effy's permanent code for this variant (`V` + 6, e.g. V7K3Q9M), generated, never edited. */
  code: string
  /** The shop's own stock code: optional, unique within the shop. */
  sku: string | null
  /** The manufacturer's barcode printed on the pack (GTIN/EAN), when it has one. */
  gtin: string | null
  /** What the shop is paid. */
  shopPriceAmount: string
  shopCompareAtAmount: string | null
  /** What the customer pays: shop price + Effy's margin. Null until the product is first approved. */
  customerPriceAmount: string | null
  customerCompareAtAmount: string | null
  weightGrams: WireInt
  /** True while nobody has recorded a real weight. */
  weightIsAssumed: boolean
  /** Decimal string, up to 3 places ("1.25"), with `packUnit`; both null when no pack size. */
  packQuantity: string | null
  packUnit: PackUnit | null
  /** One of the product's gallery pictures, or null. */
  mediaId: string | null
  state: VariantState
  stock: ProductStockDTO
}

/**
 * One option as a shop sends it. Ids are client-generated UUIDs for new options and values. An attribute
 * option's values each name a library value; a Pack size option's values carry no label — each takes the pack
 * size of the variants that name it.
 */
export interface OptionInputDTO {
  id: string
  position: WireInt
  kind: OptionKind
  attributeId?: string | null
  values: { id: string; allowedValueId?: string | null; position: WireInt }[]
}

/** One variant as a shop sends it; `id` is client-generated for a new one. */
export interface VariantInputDTO {
  id: string
  position: WireInt
  optionValueIds: OptionValueIds
  sku?: string | null
  gtin?: string | null
  shopPriceAmount: string
  shopCompareAtAmount?: string | null
  /** Recording a weight marks it measured; omit or null to keep the assumed default. */
  weightGrams?: WireInt | null
  packQuantity?: string | null
  packUnit?: PackUnit | null
  /** A storage key from the product's gallery (live, or proposed with a pending change). */
  mediaStorageKey?: string | null
}

/** POST /shop/v1/products/{id}/variants/{variantId}/state: immediate. */
export interface SetVariantStateRequest {
  state: VariantState
}

// The label

interface LabelOption {
  position: number
  values: readonly { id: string; value: string }[]
}

/**
 * A variant's label: its values in option order, joined with " / ". Null when it names no value
 * (a product with no options). A value id that is not found is skipped rather than invented.
 */
export function variantLabel(options: readonly LabelOption[], optionValueIds: readonly (string | null)[]): string | null {
  const parts: string[] = []
  const ordered = [...options].sort((a, b) => a.position - b.position)
  ordered.forEach((option, i) => {
    const id = optionValueIds[i]
    if (!id) return
    const v = option.values.find((x) => x.id === id)
    if (v) parts.push(v.value)
  })
  return parts.length > 0 ? parts.join(" / ") : null
}

/** An order line's name where one string is all there is (a manifest, a PDF line, an email): "Basmati Rice — 1 kg". The SQL twin is `lineNameSql`. */
export function lineName(productName: string, label: string | null | undefined): string {
  return label ? `${productName} — ${label}` : productName
}

/** A pack size as an option value: "500 g", "1.25 L", "12 pack". Null when the quantity is malformed. */
export function packLabel(quantity: string, unit: PackUnit): string | null {
  const thousandths = packQuantityThousandths(quantity)
  if (thousandths === null) return null
  const n = String(thousandths / 1000)
  return unit === "each" ? `${n} pack` : `${n} ${PACK_UNIT_LABELS[unit]}`
}

// Combinations (the shop console's "generate rows")

/** Every combination of the options' values, in option-then-value order. */
export function optionCombinations(options: readonly OptionInputDTO[]): OptionValueIds[] {
  const ordered = [...options].sort((a, b) => a.position - b.position)
  const values = (o: OptionInputDTO | undefined) => (o ? [...o.values].sort((a, b) => a.position - b.position).map((v) => v.id) : [])
  const [first, second] = ordered
  if (!first) return [[null, null]]
  const firstIds = values(first)
  if (!second) return firstIds.map((id) => [id, null])
  const secondIds = values(second)
  return firstIds.flatMap((a) => secondIds.map((b) => [a, b] as OptionValueIds))
}

// Validation (both ends)

/** A refusal pointing at one input: `options[0].name`, `variants[2].shopPriceAmount`, `variants`. */
export interface VariantSetError {
  field: string
  message: string
}

const MONEY = /^\d{1,10}(\.\d{1,2})?$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i


/**
 * Every rule a product's option/variant set must meet, all refusals at once (empty means valid). The
 * set's shape only: stock-code uniqueness and gallery membership are the writer's job.
 */
export function validateVariantSet(
  options: readonly OptionInputDTO[],
  variants: readonly VariantInputDTO[],
  unitBasis: UnitBasis | null | undefined,
): VariantSetError[] {
  const errors: VariantSetError[] = []
  const add = (field: string, message: string) => errors.push({ field, message })

  if (unitBasis !== null && unitBasis !== undefined && !UNIT_BASES.includes(unitBasis)) {
    add("unitBasis", `must be one of: ${UNIT_BASES.join(", ")}`)
  }

  // Options
  if (options.length > VARIANT_LIMITS.options) add("options", `a product can have at most ${VARIANT_LIMITS.options} options`)
  const positions = new Set<number>()
  const attributes = new Set<string>()
  const ids = new Set<string>()
  let packOptions = 0
  options.forEach((o, i) => {
    const f = `options[${i}]`
    if (!UUID.test(o.id)) add(`${f}.id`, "must be a UUID")
    if (ids.has(o.id)) add(`${f}.id`, "is used twice")
    ids.add(o.id)
    if (o.position !== 1 && o.position !== 2) add(`${f}.position`, "must be 1 or 2")
    else if (positions.has(o.position)) add(`${f}.position`, "is used twice")
    positions.add(o.position)
    if (o.kind === "pack_size") {
      packOptions += 1
      if (o.attributeId) add(`${f}.attributeId`, "a pack size option names no attribute")
    } else if (o.kind === "attribute") {
      if (!o.attributeId || !UUID.test(o.attributeId)) add(`${f}.attributeId`, "choose which detail this option is")
      else if (attributes.has(o.attributeId)) add(`${f}.attributeId`, "two options cannot be the same detail")
      else attributes.add(o.attributeId)
    } else {
      add(`${f}.kind`, "must be an attribute or pack size")
    }
    if (o.values.length === 0) add(`${f}.values`, "an option needs at least one value")
    if (o.values.length > VARIANT_LIMITS.valuesPerOption) add(`${f}.values`, `an option can have at most ${VARIANT_LIMITS.valuesPerOption} values`)
    const seen = new Set<string>()
    const valuePositions = new Set<number>()
    o.values.forEach((v, j) => {
      const vf = `${f}.values[${j}]`
      if (!UUID.test(v.id)) add(`${vf}.id`, "must be a UUID")
      if (ids.has(v.id)) add(`${vf}.id`, "is used twice")
      ids.add(v.id)
      if (o.kind === "attribute") {
        const allowed = v.allowedValueId ?? ""
        if (!UUID.test(allowed)) add(`${vf}.allowedValueId`, "choose a value from the list")
        else if (seen.has(allowed)) add(`${vf}.allowedValueId`, "this value is already in the option")
        seen.add(allowed)
      } else if (v.allowedValueId) {
        add(`${vf}.allowedValueId`, "a pack size value comes from the variants' pack sizes")
      }
      if (!Number.isInteger(v.position) || v.position < 0 || v.position >= VARIANT_LIMITS.valuesPerOption || valuePositions.has(v.position)) {
        add(`${vf}.position`, "must be a distinct position")
      }
      valuePositions.add(v.position)
    })
  })
  if (packOptions > 1) add("options", "a product can have one pack size option")
  if (positions.has(2) && !positions.has(1)) add("options", "the first option must come before the second")

  // Variants
  if (variants.length === 0) add("variants", "a product needs at least one variant")
  if (variants.length > VARIANT_LIMITS.variants) add("variants", `a product can have at most ${VARIANT_LIMITS.variants} variants`)

  const byPosition = [...options].sort((a, b) => a.position - b.position)
  const valueSets = byPosition.map((o) => new Set(o.values.map((v) => v.id)))
  const combos = new Set<string>()
  const variantPositions = new Set<number>()
  const variantIds = new Set<string>()
  const skus = new Set<string>()
  const used = byPosition.map(() => new Set<string>())

  variants.forEach((v, i) => {
    const f = `variants[${i}]`
    if (!UUID.test(v.id)) add(`${f}.id`, "must be a UUID")
    if (variantIds.has(v.id) || ids.has(v.id)) add(`${f}.id`, "is used twice")
    variantIds.add(v.id)
    if (!Number.isInteger(v.position) || v.position < 0 || v.position >= VARIANT_LIMITS.variants || variantPositions.has(v.position)) {
      add(`${f}.position`, "must be a distinct position")
    }
    variantPositions.add(v.position)

    // One value per defined option, none for an undefined one.
    const pair = v.optionValueIds ?? [null, null]
    for (let k = 0; k < 2; k++) {
      const id = pair[k] ?? null
      const option = byPosition[k]
      if (option && !id) add(`${f}.optionValueIds`, `choose a value for option ${k + 1}`)
      else if (!option && id) add(`${f}.optionValueIds`, "names a value of an option the product does not have")
      else if (option && id && !valueSets[k]!.has(id)) add(`${f}.optionValueIds`, `is not a value of option ${k + 1}`)
      else if (option && id) used[k]!.add(id)
    }
    const key = `${pair[0] ?? ""}|${pair[1] ?? ""}`
    if (combos.has(key)) add(`${f}.optionValueIds`, "another variant already has this combination")
    combos.add(key)

    if (typeof v.shopPriceAmount !== "string" || !MONEY.test(v.shopPriceAmount.trim())) add(`${f}.shopPriceAmount`, "enter a price like 4.50")
    const was = v.shopCompareAtAmount ?? null
    if (was !== null && was !== "") {
      if (!MONEY.test(String(was).trim())) add(`${f}.shopCompareAtAmount`, "enter a price like 5.00")
      else if (MONEY.test(v.shopPriceAmount?.trim() ?? "") && Number(was) <= Number(v.shopPriceAmount)) {
        add(`${f}.shopCompareAtAmount`, "the was-price must be higher than the price")
      }
    }

    const sku = v.sku?.trim() ?? ""
    if (sku !== "") {
      if (sku.length > 64) add(`${f}.sku`, "must be 64 characters or fewer")
      if (skus.has(sku.toLowerCase())) add(`${f}.sku`, "two variants cannot share a stock code")
      skus.add(sku.toLowerCase())
    }
    const gtin = v.gtin?.trim() ?? ""
    if (gtin !== "" && !/^\d{8,14}$/.test(gtin)) add(`${f}.gtin`, "a barcode is 8 to 14 digits")

    if (v.weightGrams !== null && v.weightGrams !== undefined && (!Number.isInteger(v.weightGrams) || v.weightGrams <= 0 || v.weightGrams > 1_000_000)) {
      add(`${f}.weightGrams`, "must be a whole number of grams above 0")
    }

    const hasQty = v.packQuantity !== null && v.packQuantity !== undefined && v.packQuantity !== ""
    const hasUnit = v.packUnit !== null && v.packUnit !== undefined
    if (hasQty !== hasUnit) add(`${f}.packQuantity`, "enter both the pack size and its unit, or neither")
    if (hasUnit && !PACK_UNITS.includes(v.packUnit as PackUnit)) add(`${f}.packUnit`, `must be one of: ${PACK_UNITS.join(", ")}`)
    if (hasQty && packQuantityThousandths(String(v.packQuantity)) === null) add(`${f}.packQuantity`, "must be above 0, with at most 3 decimal places")
    if (hasUnit && unitBasis && PACK_UNITS.includes(v.packUnit as PackUnit) && !packUnitCompatible(unitBasis, v.packUnit as PackUnit)) {
      add(`${f}.packUnit`, "does not match how this product's sizes are compared")
    }
  })

  // A value no variant uses is noise in the shopper's selector.
  byPosition.forEach((o, k) => {
    const i = options.indexOf(o)
    o.values.forEach((v, j) => {
      if (!used[k]!.has(v.id) && variants.length > 0) add(`options[${i}].values[${j}]`, "no variant uses this value")
    })
  })

  // A pack size value is the pack size of every variant naming it; two values are two different sizes.
  byPosition.forEach((o, k) => {
    if (o.kind !== "pack_size") return
    const sizeOf = new Map<string, string>()
    const valueOf = new Map<string, string>()
    variants.forEach((v, i) => {
      const id = (v.optionValueIds ?? [null, null])[k]
      if (!id) return
      const label = v.packQuantity && v.packUnit ? packLabel(String(v.packQuantity), v.packUnit) : null
      if (!label) {
        add(`variants[${i}].packQuantity`, "enter the pack size: it is this variant's option value")
        return
      }
      const known = sizeOf.get(id)
      if (known !== undefined && known !== label) add(`variants[${i}].packQuantity`, "variants with the same pack size value need the same pack size")
      sizeOf.set(id, label)
      const other = valueOf.get(label)
      if (other !== undefined && other !== id) add(`variants[${i}].packQuantity`, "two pack size values have the same size")
      valueOf.set(label, id)
    })
  })

  return errors
}

/**
 * The options against the leaf's resolved form: an attribute option must be one the leaf allows as a variant
 * option, and each value must be on that attribute's list. `rows` is the leaf's form.
 */
export function validateOptionsAgainstForm(options: readonly OptionInputDTO[], rows: readonly CategoryFormRow[]): VariantSetError[] {
  const errors: VariantSetError[] = []
  const byId = new Map(rows.map((r) => [r.attributeId, r]))
  options.forEach((o, i) => {
    if (o.kind !== "attribute" || !o.attributeId) return
    const row = byId.get(o.attributeId)
    if (!row || !row.variantOption) {
      errors.push({ field: `options[${i}].attributeId`, message: "this category does not offer that option" })
      return
    }
    const allowed = new Set(row.values.map((v) => v.id))
    o.values.forEach((v, j) => {
      if (v.allowedValueId && !allowed.has(v.allowedValueId)) {
        errors.push({ field: `options[${i}].values[${j}].allowedValueId`, message: `is not on the ${row.name} list` })
      }
    })
  })
  return errors
}
