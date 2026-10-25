import { emptyVariantSet, type VariantSetDraft } from "./variants"

export interface AttributeDraftValue {
  text?: string
  number?: string
  boolean?: boolean
  options?: string[]
}

export interface ProductDraft {
  step: number
  productTypeId: string | null
  name: string
  primaryCategoryId: string | null
  shortDescription: string
  brand: string
  longDescription: string
  variantSet: VariantSetDraft
  gstStatus: "" | "taxable" | "gst_free"
  attributes: Record<string, AttributeDraftValue>
}

export function emptyDraft(): ProductDraft {
  return {
    step: 0,
    productTypeId: null,
    name: "",
    primaryCategoryId: null,
    shortDescription: "",
    brand: "",
    longDescription: "",
    variantSet: emptyVariantSet(),
    gstStatus: "",
    attributes: {},
  }
}

const PREFIX = "effy.shop-web.catalog.draft"

export function draftKey(shopId: string, subject: string): string {
  return `${PREFIX}.${shopId}.${subject}`
}

export function loadDraft(shopId: string, subject: string): ProductDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(shopId, subject))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ProductDraft>
    if (typeof parsed !== "object" || parsed === null) return null
    const variantSet =
      parsed.variantSet && Array.isArray(parsed.variantSet.variants) && parsed.variantSet.variants.length > 0
        ? parsed.variantSet
        : emptyVariantSet()
    return { ...emptyDraft(), ...parsed, variantSet, attributes: parsed.attributes ?? {} }
  } catch {
    return null
  }
}

export function saveDraft(shopId: string, subject: string, draft: ProductDraft): void {
  try {
    window.localStorage.setItem(draftKey(shopId, subject), JSON.stringify(draft))
  } catch {}
}

export function clearDraft(shopId: string, subject: string): void {
  try {
    window.localStorage.removeItem(draftKey(shopId, subject))
  } catch {}
}
