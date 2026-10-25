import type { AttributeValueInputDTO, UpdateProductRequest } from "@effy/shared-types"

import type { ProductDetail, ProductType } from "./model"
import type { AttributeDraftValue } from "./draft"
import { collectAttributeInputs } from "./validation"

interface ScalarFieldPatch {
  name?: string
  shortDescription?: string
  longDescription?: string | null
  brand?: string | null
  productTypeId?: string
  primaryCategoryId?: string
  gstStatus?: "taxable" | "gst_free"
}

const SCALAR_KEYS: (keyof ScalarFieldPatch)[] = [
  "name",
  "shortDescription",
  "longDescription",
  "brand",
  "productTypeId",
  "primaryCategoryId",
  "gstStatus",
]

export function diffScalarFields(current: ProductDetail, edited: ScalarFieldPatch): ScalarFieldPatch {
  const out: ScalarFieldPatch = {}
  for (const key of SCALAR_KEYS) {
    if (!(key in edited)) continue
    const next = edited[key]
    if (next === undefined) continue
    const currentValue = (current as unknown as Record<string, unknown>)[key] ?? null
    if ((next ?? null) !== currentValue) {
      ;(out as Record<string, unknown>)[key] = next
    }
  }
  return out
}

export function buildProductUpdate(expectedUpdatedAt: string, changed: ScalarFieldPatch): UpdateProductRequest {
  return { expectedUpdatedAt, ...changed }
}

export function buildAttributeUpdate(
  expectedUpdatedAt: string,
  type: ProductType,
  values: Record<string, AttributeDraftValue>,
): UpdateProductRequest {
  const attributes: AttributeValueInputDTO[] = collectAttributeInputs(type, values)
  return { expectedUpdatedAt, attributes }
}

export function seedAttributeDraft(detail: ProductDetail): Record<string, AttributeDraftValue> {
  const out: Record<string, AttributeDraftValue> = {}
  for (const a of detail.attributes) {
    switch (a.dataType) {
      case "short_text":
      case "long_text":
      case "single_select":
        out[a.attributeId] = { text: a.valueText ?? "" }
        break
      case "number":
        out[a.attributeId] = { number: a.valueNumber != null ? String(a.valueNumber) : "" }
        break
      case "boolean":
        out[a.attributeId] = { boolean: a.valueBoolean ?? false }
        break
      case "multi_select":
        out[a.attributeId] = { options: a.valueOptions ?? [] }
        break
    }
  }
  return out
}
