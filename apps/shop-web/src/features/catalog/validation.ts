import type { AttributeValueInputDTO } from "@effy/shared-types";

import type { ProductType, ProductTypeAttribute } from "./model";
import type { AttributeDraftValue, ProductDraft } from "./draft";

/**
 * Pure form-gating + attribute mapping (no React, no I/O — unit-testable in isolation).
 *
 * The backend is authoritative (it re-validates everything server-side); this only decides when the
 * step form may advance and shapes the wire payload. Mandatory = the universal fields (name / type /
 * category / price / short description / primary image) PLUS the selected type's mandatory attributes.
 */

/** A positive decimal money string (the wire carries price as a string to avoid float drift). */
export function isValidPrice(raw: string): boolean {
  const s = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return false;
  return Number(s) > 0;
}

/** Validate one attribute value against its data type + validation envelope. `null` = OK. */
export function attributeError(
  attr: ProductTypeAttribute,
  value: AttributeDraftValue | undefined,
): string | null {
  const v = value ?? {};
  const req = attr.isMandatory;

  switch (attr.dataType) {
    case "short_text":
    case "long_text": {
      const text = (v.text ?? "").trim();
      if (!text) return req ? "Required" : null;
      const max = attr.validation?.maxLength;
      if (max != null && text.length > max) return `Must be ${max} characters or fewer`;
      return null;
    }
    case "number": {
      const raw = (v.number ?? "").trim();
      if (!raw) return req ? "Required" : null;
      const n = Number(raw);
      if (!Number.isFinite(n)) return "Must be a number";
      if (attr.validation?.min != null && n < attr.validation.min)
        return `Must be at least ${attr.validation.min}`;
      if (attr.validation?.max != null && n > attr.validation.max)
        return `Must be at most ${attr.validation.max}`;
      return null;
    }
    case "boolean":
      // A boolean always has an answer (false is a valid one), so a mandatory boolean is never unmet.
      return null;
    case "single_select": {
      const sel = (v.text ?? "").trim();
      if (!sel) return req ? "Required" : null;
      if (!attr.allowedValues.some((o) => o.value === sel)) return "Choose a valid option";
      return null;
    }
    case "multi_select": {
      const opts = v.options ?? [];
      if (opts.length === 0) return req ? "Select at least one" : null;
      if (!opts.every((o) => attr.allowedValues.some((a) => a.value === o)))
        return "Contains an invalid option";
      return null;
    }
    default:
      return null;
  }
}

/** Errors for every attribute of the type, keyed by attributeId (empty = all valid). */
export function attributeErrors(
  type: ProductType,
  values: Record<string, AttributeDraftValue>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of type.attributes) {
    const err = attributeError(attr, values[attr.attributeId]);
    if (err) out[attr.attributeId] = err;
  }
  return out;
}

/** Every attribute of the type is valid (mandatory present, optionals well-formed). */
export function attributesValid(
  type: ProductType,
  values: Record<string, AttributeDraftValue>,
): boolean {
  return Object.keys(attributeErrors(type, values)).length === 0;
}

/** Convert one draft attribute value to its wire input, or `null` if it is empty/unset. */
export function toAttributeInput(
  attr: ProductTypeAttribute,
  value: AttributeDraftValue | undefined,
): AttributeValueInputDTO | null {
  const v = value ?? {};
  switch (attr.dataType) {
    case "short_text":
    case "long_text":
    case "single_select": {
      const text = (v.text ?? "").trim();
      return text ? { attributeId: attr.attributeId, valueText: text } : null;
    }
    case "number": {
      const raw = (v.number ?? "").trim();
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? { attributeId: attr.attributeId, valueNumber: n } : null;
    }
    case "boolean":
      return v.boolean == null
        ? null
        : { attributeId: attr.attributeId, valueBoolean: v.boolean };
    case "multi_select": {
      const opts = v.options ?? [];
      return opts.length ? { attributeId: attr.attributeId, valueOptions: opts } : null;
    }
    default:
      return null;
  }
}

/** All set attribute values as wire inputs (skips the empty ones). */
export function collectAttributeInputs(
  type: ProductType,
  values: Record<string, AttributeDraftValue>,
): AttributeValueInputDTO[] {
  const out: AttributeValueInputDTO[] = [];
  for (const attr of type.attributes) {
    const input = toAttributeInput(attr, values[attr.attributeId]);
    if (input) out.push(input);
  }
  return out;
}

/** Step 2 universal basics complete (image is a `File` in component state, checked separately). */
export function basicsComplete(draft: ProductDraft): boolean {
  return (
    draft.name.trim().length > 0 &&
    !!draft.primaryCategoryId &&
    isValidPrice(draft.priceAmount) &&
    draft.shortDescription.trim().length > 0
  );
}
