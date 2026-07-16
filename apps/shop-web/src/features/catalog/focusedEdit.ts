import type { AttributeValueInputDTO, UpdateProductRequest } from "@effy/shared-types";

import type { ProductDetail, ProductType } from "./model";
import type { AttributeDraftValue } from "./draft";
import { collectAttributeInputs } from "./validation";

/**
 * Pure payload builders for the focused-edit dialogs (US4 — no React, no I/O, unit-testable).
 *
 * A focused edit PATCHes a small subset: the fields in the one section the operator opened, and
 * NOTHING else. Every payload additionally carries `expectedUpdatedAt` — the `updatedAt` from the
 * loaded detail — so a stale edit is rejected server-side with 409 (optimistic concurrency, FR-023a).
 */

/** The scalar (non-attribute) fields a focused-edit dialog may change. */
export interface ScalarFieldPatch {
  name?: string;
  shortDescription?: string;
  longDescription?: string | null;
  brand?: string | null;
  sku?: string | null;
  gtin?: string | null;
  priceAmount?: string;
  compareAtAmount?: string | null;
  productTypeId?: string;
  primaryCategoryId?: string;
}

const SCALAR_KEYS: (keyof ScalarFieldPatch)[] = [
  "name",
  "shortDescription",
  "longDescription",
  "brand",
  "sku",
  "gtin",
  "priceAmount",
  "compareAtAmount",
  "productTypeId",
  "primaryCategoryId",
];

/**
 * The changed subset of scalar fields — only the keys whose `edited` value differs from the loaded
 * `current`. Unchanged fields are omitted so the PATCH stays minimal (and the mandatory-cannot-clear
 * rule is never tripped by a field the operator never touched).
 */
export function diffScalarFields(
  current: ProductDetail,
  edited: ScalarFieldPatch,
): ScalarFieldPatch {
  const out: ScalarFieldPatch = {};
  for (const key of SCALAR_KEYS) {
    if (!(key in edited)) continue;
    const next = edited[key];
    if (next === undefined) continue;
    const currentValue = (current as unknown as Record<string, unknown>)[key] ?? null;
    // Compare on a null-normalized basis so "" vs null and unset vs null read as changes correctly.
    if ((next ?? null) !== currentValue) {
      (out as Record<string, unknown>)[key] = next;
    }
  }
  return out;
}

/** Wrap a changed subset with the required concurrency token → the exact PATCH body (FR-023a). */
export function buildProductUpdate(
  expectedUpdatedAt: string,
  changed: ScalarFieldPatch,
): UpdateProductRequest {
  return { expectedUpdatedAt, ...changed };
}

/** An attributes-only focused edit: the type's set attribute values as wire inputs + the token. */
export function buildAttributeUpdate(
  expectedUpdatedAt: string,
  type: ProductType,
  values: Record<string, AttributeDraftValue>,
): UpdateProductRequest {
  const attributes: AttributeValueInputDTO[] = collectAttributeInputs(type, values);
  return { expectedUpdatedAt, attributes };
}

/** Seed the attribute editor from a loaded product's typed values → the draft shape AttributeField uses. */
export function seedAttributeDraft(detail: ProductDetail): Record<string, AttributeDraftValue> {
  const out: Record<string, AttributeDraftValue> = {};
  for (const a of detail.attributes) {
    switch (a.dataType) {
      case "short_text":
      case "long_text":
      case "single_select":
        out[a.attributeId] = { text: a.valueText ?? "" };
        break;
      case "number":
        out[a.attributeId] = { number: a.valueNumber != null ? String(a.valueNumber) : "" };
        break;
      case "boolean":
        out[a.attributeId] = { boolean: a.valueBoolean ?? false };
        break;
      case "multi_select":
        out[a.attributeId] = { options: a.valueOptions ?? [] };
        break;
    }
  }
  return out;
}
