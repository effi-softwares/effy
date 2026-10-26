import type { UpdateProductRequest } from "@effy/shared-types"

import type { ProductDetail } from "./model"

interface ScalarFieldPatch {
  name?: string
  shortDescription?: string
  longDescription?: string | null
  brand?: string | null
}

const SCALAR_KEYS: (keyof ScalarFieldPatch)[] = ["name", "shortDescription", "longDescription", "brand"]

/** Only the text fields that changed. Category, facts, details and sizes have their own edits. */
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
