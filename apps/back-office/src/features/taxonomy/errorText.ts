import { isDomainError } from "@effy/api-client"

import { CATEGORY_DEPTH_MAX, PLACEMENTS_MAX } from "@effy/shared-types"

/** The taxonomy routes' refusal codes, in the console's words. Server text is never shown. */
const CODES: Record<string, string> = {
  category_too_deep: `The tree is ${CATEGORY_DEPTH_MAX} levels deep at most.`,
  category_cycle: "A category can't sit under one of its own sub-categories.",
  category_sibling_name_taken: "Another category here already has that name.",
  category_has_products: "Products are filed in that category.",
  category_in_use: "Products are filed in this category. Move them to another category first.",
  category_has_children: "Retire or move its sub-categories first.",
  category_retired: "Restore the category first.",
  parent_retired: "Its parent is retired. Restore the parent first.",
  invalid_icon: "Choose one of the listed icons.",
  invalid_image: "Upload the picture again.",
  unsupported_media_type: "Use a JPEG, PNG or WebP picture up to 10 MB.",
  attribute_name_taken: "Another attribute already has that name.",
  attribute_is_stock_date: "Expiry, packed and batch dates are recorded with stock, not as product details.",
  attribute_in_use:
    "Products use this attribute, so its input type and unit family can't change and it can't be retired.",
  attribute_retired: "That attribute is retired.",
  value_in_use: "Products use that value. Retire it instead of removing it.",
  invalid_attribute: "Check the highlighted fields.",
  attachment_loosens: "A sub-category can only make an inherited attribute stricter.",
  nothing_to_hide: "This category doesn't inherit that attribute.",
  attachment_not_found: "That attachment was already removed.",
  category_not_leaf: "Choose categories with no sub-categories.",
  placement_is_home: "That is the product's own category.",
  too_many_placements: `At most ${PLACEMENTS_MAX} extra categories.`,
}

export function taxonomyErrorText(err: unknown): string {
  if (isDomainError(err)) {
    if (err.code && CODES[err.code]) return CODES[err.code]!
    if (err.kind === "forbidden") return "You don't have permission to change the taxonomy."
    if (err.kind === "not-found") return "That item no longer exists."
    if (err.kind === "unavailable") return "The service is waking up or unreachable. Try again in a moment."
    if (err.status === 400) return "Check the fields and try again."
  }
  return "Something went wrong. Try again."
}

/** Field-level messages from a 400, keyed by field name (`values[2].label` → its own key). */
export function taxonomyFieldErrors(err: unknown): Record<string, string> {
  if (!isDomainError(err) || !err.fields) return {}
  return Object.fromEntries(err.fields.map((f) => [f.field, f.message]))
}

/** The refusal code, for screens that branch on it (e.g. asking to move products). */
export const refusalCode = (err: unknown): string | undefined => (isDomainError(err) ? err.code : undefined)
