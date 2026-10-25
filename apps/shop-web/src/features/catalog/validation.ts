import type { AttributeValueInputDTO } from "@effy/shared-types"

import type { ProductType, ProductTypeAttribute } from "./model"
import type { AttributeDraftValue, ProductDraft } from "./draft"

export function isValidPrice(raw: string): boolean {
  const s = raw.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return false
  return Number(s) > 0
}

export function attributeError(attr: ProductTypeAttribute, value: AttributeDraftValue | undefined): string | null {
  const v = value ?? {}
  const req = attr.isMandatory

  switch (attr.dataType) {
    case "short_text":
    case "long_text": {
      const text = (v.text ?? "").trim()
      if (!text) return req ? "Required" : null
      const max = attr.validation?.maxLength
      if (max != null && text.length > max) return `Must be ${max} characters or fewer`
      return null
    }
    case "number": {
      const raw = (v.number ?? "").trim()
      if (!raw) return req ? "Required" : null
      const n = Number(raw)
      if (!Number.isFinite(n)) return "Must be a number"
      if (attr.validation?.min != null && n < attr.validation.min) return `Must be at least ${attr.validation.min}`
      if (attr.validation?.max != null && n > attr.validation.max) return `Must be at most ${attr.validation.max}`
      return null
    }
    case "boolean":
      return null
    case "single_select": {
      const sel = (v.text ?? "").trim()
      if (!sel) return req ? "Required" : null
      if (!attr.allowedValues.some((o) => o.value === sel)) return "Choose a valid option"
      return null
    }
    case "multi_select": {
      const opts = v.options ?? []
      if (opts.length === 0) return req ? "Select at least one" : null
      if (!opts.every((o) => attr.allowedValues.some((a) => a.value === o))) return "Contains an invalid option"
      return null
    }
    default:
      return null
  }
}

export function attributeErrors(
  type: ProductType,
  values: Record<string, AttributeDraftValue>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const attr of type.attributes) {
    const err = attributeError(attr, values[attr.attributeId])
    if (err) out[attr.attributeId] = err
  }
  return out
}

export function attributesValid(type: ProductType, values: Record<string, AttributeDraftValue>): boolean {
  return Object.keys(attributeErrors(type, values)).length === 0
}

export function toAttributeInput(
  attr: ProductTypeAttribute,
  value: AttributeDraftValue | undefined,
): AttributeValueInputDTO | null {
  const v = value ?? {}
  switch (attr.dataType) {
    case "short_text":
    case "long_text":
    case "single_select": {
      const text = (v.text ?? "").trim()
      return text ? { attributeId: attr.attributeId, valueText: text } : null
    }
    case "number": {
      const raw = (v.number ?? "").trim()
      if (!raw) return null
      const n = Number(raw)
      return Number.isFinite(n) ? { attributeId: attr.attributeId, valueNumber: n } : null
    }
    case "boolean":
      return v.boolean == null ? null : { attributeId: attr.attributeId, valueBoolean: v.boolean }
    case "multi_select": {
      const opts = v.options ?? []
      return opts.length ? { attributeId: attr.attributeId, valueOptions: opts } : null
    }
    default:
      return null
  }
}

export function collectAttributeInputs(
  type: ProductType,
  values: Record<string, AttributeDraftValue>,
): AttributeValueInputDTO[] {
  const out: AttributeValueInputDTO[] = []
  for (const attr of type.attributes) {
    const input = toAttributeInput(attr, values[attr.attributeId])
    if (input) out.push(input)
  }
  return out
}

export function basicsComplete(draft: ProductDraft): boolean {
  return (
    draft.name.trim().length > 0 &&
    !!draft.primaryCategoryId &&
    draft.shortDescription.trim().length > 0 &&
    // Every product is taxable or GST-free from the moment it exists.
    (draft.gstStatus === "taxable" || draft.gstStatus === "gst_free")
  )
}
