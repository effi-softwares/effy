import type { ProductAttributeValue, ProductDetail, ProductMedia } from "./model";

/**
 * Pure display formatting for the detail page (US4 — no React, unit-testable).
 *
 * The detail DTO doubles as the domain shape (model.ts), so there is no wire→domain remap; what this
 * module maps is a typed EAV value → a human-readable string for a `<dl>` row, and it resolves the
 * detail's media into a stable gallery order.
 */

/** Money for a detail row — the wire carries price as a decimal string to avoid float drift. */
export function formatMoney(amount: string | null, currency: string): string {
  if (!amount) return "—";
  return `${currency} ${amount}`;
}

/** Render one typed attribute value for a detail row, using only the field its data type sets. */
export function formatAttributeValue(attr: ProductAttributeValue): string {
  switch (attr.dataType) {
    case "short_text":
    case "long_text":
      return attr.valueText?.trim() || "—";
    case "single_select":
      return attr.valueText?.trim() || "—";
    case "number": {
      if (attr.valueNumber == null) return "—";
      return attr.unit ? `${attr.valueNumber} ${attr.unit}` : String(attr.valueNumber);
    }
    case "boolean":
      if (attr.valueBoolean == null) return "—";
      return attr.valueBoolean ? "Yes" : "No";
    case "multi_select":
      return attr.valueOptions && attr.valueOptions.length ? attr.valueOptions.join(", ") : "—";
    default:
      return "—";
  }
}

/** Gallery order: the primary image first, then everything else by `displayOrder` (stable). */
export function orderedMedia(detail: ProductDetail): ProductMedia[] {
  return [...detail.media].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.displayOrder - b.displayOrder;
  });
}

/** The primary image, if any (the create flow guarantees one on an active product). */
export function primaryMedia(detail: ProductDetail): ProductMedia | null {
  return detail.media.find((m) => m.isPrimary) ?? null;
}
