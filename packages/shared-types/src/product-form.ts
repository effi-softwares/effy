/**
 * The rules for a product's details against its leaf's form (101), shared by shop-web and the server so both
 * refuse the same input with the same words:
 *
 *  • `validateDetails` - every value fits its attribute (type, unit, limits, allowed values). It does not
 *    demand required details: a draft saves as it goes, and submission asks `missingDetails` (the server asks
 *    `product_missing_required`, its SQL twin).
 *  • `missingDetails` - required details still empty, per variant where a detail differs by variant.
 *  • `recategorise` - what a draft keeps and drops when its category changes.
 *  • `formatAttributeValue` - how a value reads to a customer.
 *  • `isStockDateName` - names the library refuses: those are stock facts (expiry, batch), never details.
 */
import type { GstStatus } from "./documents"
import type { CategoryFormDTO, CategoryFormRow, DetailInput, DetailValue, FactDefaults, Storage } from "./taxonomy"
import { formatQuantity, isUnitFamily, toBase } from "./units"

export interface DetailError {
  /** `details.<key>` for the whole product, `details.<key>[<variantId>]` for one variant. */
  field: string
  message: string
}

/** A variant as the details rules need it: active ones only. */
export interface DetailVariant {
  id: string
  label: string
}

const STOCK_DATE = /\b(expir|best[ -]?before|use[ -]?by|manufactur|packed|packing date|batch|lot)/i

export function isStockDateName(name: string): boolean {
  return STOCK_DATE.test(name)
}

export function formRows(form: Pick<CategoryFormDTO, "sections">): CategoryFormRow[] {
  return form.sections.flatMap((s) => s.rows)
}

const SHORT_TEXT_MAX = 200
const LONG_TEXT_MAX = 2000
const NUMBER = /^-?\d+(\.\d+)?$/
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

function validDate(s: string): boolean {
  const m = DATE.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

/** Why one value does not fit its attribute, or null when it does. */
export function valueProblem(row: CategoryFormRow, value: DetailValue): string | null {
  switch (row.inputType) {
    case "short_text":
    case "long_text": {
      if (!("text" in value) || typeof value.text !== "string") return `${row.name} must be text`
      const text = value.text.trim()
      if (text === "") return `Enter ${row.name.toLowerCase()} or leave it out`
      const max = row.maxLength ?? (row.inputType === "short_text" ? SHORT_TEXT_MAX : LONG_TEXT_MAX)
      if (text.length > max) return `${row.name} is longer than ${max} characters`
      return null
    }
    case "number": {
      if (!("number" in value) || typeof value.number !== "string" || !NUMBER.test(value.number.trim())) {
        return `${row.name} must be a number`
      }
      const raw = value.number.trim()
      const places = raw.includes(".") ? raw.split(".")[1]!.length : 0
      if (row.decimals !== null && places > row.decimals) {
        return row.decimals === 0 ? `${row.name} must be a whole number` : `${row.name} allows ${row.decimals} decimal places`
      }
      let base = Number(raw)
      if (row.unitFamily && isUnitFamily(row.unitFamily)) {
        const unit = value.unit ?? null
        if (!unit || !row.units.includes(unit)) return `Choose a unit for ${row.name.toLowerCase()}: ${row.units.join(", ")}`
        base = toBase(Number(raw), row.unitFamily, unit)
      } else if (value.unit) {
        return `${row.name} has no unit`
      }
      if (row.min !== null && base < Number(row.min)) return `${row.name} is below the smallest allowed value`
      if (row.max !== null && base > Number(row.max)) return `${row.name} is above the largest allowed value`
      return null
    }
    case "boolean":
      return "boolean" in value && typeof value.boolean === "boolean" ? null : `${row.name} must be yes or no`
    case "single_select":
    case "multi_select": {
      if (!("valueIds" in value) || !Array.isArray(value.valueIds)) return `Choose ${row.name.toLowerCase()}`
      const ids = value.valueIds
      if (ids.length === 0) return `Choose ${row.name.toLowerCase()} or leave it out`
      if (row.inputType === "single_select" && ids.length !== 1) return `Choose one ${row.name.toLowerCase()}`
      if (new Set(ids).size !== ids.length) return `${row.name} lists a value twice`
      const known = new Set(row.values.map((v) => v.id))
      if (ids.some((id) => !known.has(id))) return `${row.name} has a value that is not on its list`
      return null
    }
    case "date":
      return "date" in value && typeof value.date === "string" && validDate(value.date) ? null : `${row.name} must be a date`
    case "time":
      return "time" in value && typeof value.time === "string" && TIME.test(value.time) ? null : `${row.name} must be a time (HH:MM)`
  }
}

export interface ValidateDetailsOptions {
  /** Attributes that are this product's variant options: set through the options, never as details. */
  optionAttributeIds?: readonly string[]
}

/** Every problem with the details as sent; [] when they fit. Required details are not demanded here. */
export function validateDetails(
  rows: readonly CategoryFormRow[],
  details: readonly DetailInput[],
  variants: readonly DetailVariant[],
  options: ValidateDetailsOptions = {},
): DetailError[] {
  const errors: DetailError[] = []
  const byId = new Map(rows.map((r) => [r.attributeId, r]))
  const optionIds = new Set(options.optionAttributeIds ?? [])
  const variantIds = new Set(variants.map((v) => v.id))
  const seen = new Set<string>()

  for (const d of details) {
    const row = byId.get(d.attributeId)
    if (!row) {
      errors.push({ field: `details.${d.attributeId}`, message: "This detail is not asked for in this category" })
      continue
    }
    const field = `details.${row.key}`
    if (seen.has(row.attributeId)) {
      errors.push({ field, message: `${row.name} is sent twice` })
      continue
    }
    seen.add(row.attributeId)
    if (optionIds.has(row.attributeId)) {
      errors.push({ field, message: `${row.name} is set per variant by its option` })
      continue
    }
    const hasValue = d.value !== undefined
    const hasPer = d.perVariant !== undefined
    if (hasValue === hasPer) {
      errors.push({ field, message: `Send ${row.name.toLowerCase()} once for the product or once per variant` })
      continue
    }
    if (hasValue) {
      const problem = valueProblem(row, d.value!)
      if (problem) errors.push({ field, message: problem })
      continue
    }
    if (!row.variesByVariant) {
      errors.push({ field, message: `${row.name} is the same for every variant` })
      continue
    }
    if (variants.length < 2) {
      errors.push({ field, message: `${row.name} can only differ when there is more than one variant` })
      continue
    }
    const perSeen = new Set<string>()
    for (const p of d.perVariant!) {
      const vf = `${field}[${p.variantId}]`
      if (!variantIds.has(p.variantId)) {
        errors.push({ field: vf, message: `${row.name} names a variant this product does not have` })
        continue
      }
      if (perSeen.has(p.variantId)) {
        errors.push({ field: vf, message: `${row.name} is sent twice for one variant` })
        continue
      }
      perSeen.add(p.variantId)
      const problem = valueProblem(row, p.value)
      if (problem) errors.push({ field: vf, message: problem })
    }
  }
  return errors
}

/** Required details still empty: "Allergens", or "Allergens (Mango / 500 g)" for a per-variant gap. */
export function missingDetails(
  rows: readonly CategoryFormRow[],
  details: readonly DetailInput[],
  variants: readonly DetailVariant[],
  options: ValidateDetailsOptions = {},
): string[] {
  const optionIds = new Set(options.optionAttributeIds ?? [])
  const byAttr = new Map(details.map((d) => [d.attributeId, d]))
  const missing: string[] = []
  for (const row of rows) {
    if (row.level !== "required" || optionIds.has(row.attributeId)) continue
    const d = byAttr.get(row.attributeId)
    if (!d || (d.value === undefined && (!d.perVariant || d.perVariant.length === 0))) {
      missing.push(row.name)
      continue
    }
    if (d.value !== undefined) continue
    const covered = new Set(d.perVariant!.map((p) => p.variantId))
    for (const v of variants) if (!covered.has(v.id)) missing.push(`${row.name} (${v.label})`)
  }
  return missing
}

export type FactKey = "storage" | "gstStatus" | "ageRestricted"

export interface ProductFacts {
  storage: Storage | null
  gstStatus: GstStatus | null
  ageRestricted: boolean | null
}

/** Where no category up the tree sets a fact, a new product starts at room temperature, GST-free and not 18+. */
export const FACT_FALLBACK = { storage: "ambient", gstStatus: "gst_free", ageRestricted: false } as const satisfies {
  [K in FactKey]: NonNullable<ProductFacts[K]>
}

/** A form's facts against a leaf: those changed by hand stay, the others take its default (else the fallback). */
export function followDefaults(
  facts: ProductFacts,
  touched: readonly FactKey[],
  defaults: FactDefaults,
): ProductFacts {
  const pick = <K extends FactKey>(k: K): ProductFacts[K] =>
    touched.includes(k) ? facts[k] : (defaults[k] ?? FACT_FALLBACK[k])
  return { storage: pick("storage"), gstStatus: pick("gstStatus"), ageRestricted: pick("ageRestricted") }
}

export interface RecategoriseResult {
  details: DetailInput[]
  /** Names of the details the new category does not ask for (hidden there included). */
  dropped: string[]
  facts: ProductFacts
}

/**
 * A draft moving to another leaf: it keeps the details the new form asks for and drops the rest; facts the
 * shop changed by hand stay, the others take the new leaf's defaults.
 */
export function recategorise(
  draft: { details: readonly DetailInput[]; facts: ProductFacts; factsTouched: readonly FactKey[] },
  oldRows: readonly CategoryFormRow[],
  newRows: readonly CategoryFormRow[],
  newDefaults: FactDefaults,
): RecategoriseResult {
  const keep = new Set(newRows.map((r) => r.attributeId))
  const oldName = new Map(oldRows.map((r) => [r.attributeId, r.name]))
  const details: DetailInput[] = []
  const dropped: string[] = []
  for (const d of draft.details) {
    if (keep.has(d.attributeId)) details.push(d)
    else dropped.push(oldName.get(d.attributeId) ?? d.attributeId)
  }
  return { details, dropped, facts: followDefaults(draft.facts, draft.factsTouched, newDefaults) }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
  "November", "December"]

/** How a value reads to a customer: "1.5 kg", "Yes", "Milk, Eggs", "3 March 2026", "09:30". */
export function formatAttributeValue(row: Pick<CategoryFormRow, "inputType" | "values">, value: DetailValue): string {
  if ("text" in value) return value.text.trim()
  if ("number" in value) return formatQuantity(Number(value.number), value.unit ?? null)
  if ("boolean" in value) return value.boolean ? "Yes" : "No"
  if ("valueIds" in value) {
    const label = new Map(row.values.map((v) => [v.id, v.label]))
    return value.valueIds.map((id) => label.get(id)).filter((l): l is string => !!l).join(", ")
  }
  if ("date" in value) {
    const m = DATE.exec(value.date)
    return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : value.date
  }
  return value.time
}
