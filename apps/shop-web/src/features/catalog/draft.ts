/**
 * Device-local create draft (FR-012).
 *
 * A half-finished product survives a closed dialog, a refresh, or a crashed tab, because it lives in
 * `localStorage` — NOT the server (an unpublished product does not exist to the backend yet). It is
 * pure client state, so it never touches the TanStack Query cache (Principle VI).
 *
 * Keyed per **shop + subject**: two operators sharing a workplace browser never see each other's
 * in-progress product, and switching the active shop starts a clean draft.
 *
 * The chosen primary image (a `File`) is deliberately NOT persisted — a `File` cannot be revived
 * from storage across a reload. The text fields restore; the operator re-picks the image on reopen.
 */

import { emptyVariantSet, type VariantSetDraft } from "./variants";

/** One attribute's in-progress value. Only the field matching the attribute's data type is set. */
export interface AttributeDraftValue {
  text?: string;
  number?: string;
  boolean?: boolean;
  options?: string[];
}

/** The serializable half of the create form (everything except the image `File`). */
export interface ProductDraft {
  step: number;
  productTypeId: string | null;
  name: string;
  primaryCategoryId: string | null;
  shortDescription: string;
  brand: string;
  longDescription: string;
  /**
   * 098 — the options and variants: each variant's price, codes, shipping weight and pack size. ⚠ Every
   * variant field is a STRING here: "" must survive localStorage as "not answered" (a zero weight
   * ships free).
   */
  variantSet: VariantSetDraft;
  /** 096 — taxable or GST-free; "" until the operator chooses (required to create). */
  gstStatus: "" | "taxable" | "gst_free";
  attributes: Record<string, AttributeDraftValue>;
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
  };
}

const PREFIX = "effy.shop-web.catalog.draft";

export function draftKey(shopId: string, subject: string): string {
  return `${PREFIX}.${shopId}.${subject}`;
}

/** Best-effort load: a malformed/legacy blob is treated as "no draft" rather than throwing. */
export function loadDraft(shopId: string, subject: string): ProductDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(shopId, subject));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProductDraft>;
    if (typeof parsed !== "object" || parsed === null) return null;
    // Merge over a fresh draft so a partial/old shape never yields undefined fields.
    // A draft saved before 098 has no variant set: it starts with one empty variant.
    const variantSet = parsed.variantSet && Array.isArray(parsed.variantSet.variants) && parsed.variantSet.variants.length > 0
      ? parsed.variantSet
      : emptyVariantSet();
    return { ...emptyDraft(), ...parsed, variantSet, attributes: parsed.attributes ?? {} };
  } catch {
    return null;
  }
}

export function saveDraft(shopId: string, subject: string, draft: ProductDraft): void {
  try {
    window.localStorage.setItem(draftKey(shopId, subject), JSON.stringify(draft));
  } catch {
    /* private mode / quota exceeded — a lost draft is acceptable; never break the form. */
  }
}

export function clearDraft(shopId: string, subject: string): void {
  try {
    window.localStorage.removeItem(draftKey(shopId, subject));
  } catch {
    /* ignore */
  }
}
