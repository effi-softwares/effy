import type { ProductDraft } from "../draft"
import type { ProductType } from "../model"
import { attributesValid, basicsComplete } from "../validation"
import { variantSetValid } from "../variants"

export const STEPS = [
  { title: "Product type", hint: "Choose the kind of product, which decides the details you fill in next." },
  { title: "Basics", hint: "The name, description and category shoppers see when they find this product." },
  { title: "Sizes & prices", hint: "Set the price, or add options such as size and price each one." },
  { title: "Image", hint: "Add one photo, used for this product everywhere customers see it." },
  { title: "Details", hint: "Fill in the details this product type needs; required ones are marked." },
  { title: "Review", hint: "Check everything, then submit; it goes on sale once Effy approves it." },
] as const

export const SIZES_STEP = 2

export function canAdvance(
  step: number,
  draft: ProductDraft,
  type: ProductType | undefined,
  hasImage: boolean,
): boolean {
  switch (step) {
    case 0:
      return !!type
    case 1:
      return basicsComplete(draft)
    case 2:
      return variantSetValid(draft.variantSet)
    case 3:
      return hasImage
    case 4:
      return !!type && attributesValid(type, draft.attributes)
    default:
      return true
  }
}

const PRICE = /^\d+(\.\d{1,2})?$/

export function previewPrice(draft: ProductDraft): string {
  const prices = draft.variantSet.variants.map((v) => v.shopPriceAmount.trim()).filter((p) => PRICE.test(p))
  if (prices.length === 0) return "—"
  const lowest = prices.reduce((min, p) => (Number(p) < Number(min) ? p : min))
  const varies = new Set(prices.map(Number)).size > 1
  return `${varies ? "From " : ""}${lowest}`
}
