import type { DetailInput, FactKey, ProductFacts } from "@effy/shared-types";

import { emptyVariantSet, type VariantSetDraft } from "./variants";

export interface ProductDraft {
  step: number;
  name: string;
  /** The home leaf. */
  primaryCategoryId: string | null;
  shortDescription: string;
  brand: string;
  longDescription: string;
  variantSet: VariantSetDraft;
  /** Storage, GST and 18+: the leaf's defaults until the shop changes one (then it is in `factsTouched`). */
  facts: ProductFacts;
  factsTouched: FactKey[];
  /** Values for the leaf's form; per variant where a detail differs by size. */
  details: DetailInput[];
}

export function emptyDraft(): ProductDraft {
  return {
    step: 0,
    name: "",
    primaryCategoryId: null,
    shortDescription: "",
    brand: "",
    longDescription: "",
    variantSet: emptyVariantSet(),
    facts: { storage: null, gstStatus: null, ageRestricted: null },
    factsTouched: [],
    details: [],
  };
}

const PREFIX = "effy.shop-web.catalog.draft";

export function draftKey(shopId: string, subject: string): string {
  return `${PREFIX}.${shopId}.${subject}`;
}

export function loadDraft(
  shopId: string,
  subject: string,
): ProductDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(shopId, subject));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProductDraft> & {
      attributes?: unknown;
    };
    if (typeof parsed !== "object" || parsed === null) return null;
    // A draft saved before 101 kept its details as `attributes` of a type: it cannot be carried over.
    if ("attributes" in parsed) return null;
    const variantSet =
      parsed.variantSet &&
      Array.isArray(parsed.variantSet.variants) &&
      parsed.variantSet.variants.length > 0
        ? { ...parsed.variantSet, packs: parsed.variantSet.packs ?? {} }
        : emptyVariantSet();
    const base = emptyDraft();
    return {
      ...base,
      ...parsed,
      variantSet,
      facts: { ...base.facts, ...(parsed.facts ?? {}) },
      factsTouched: Array.isArray(parsed.factsTouched)
        ? parsed.factsTouched
        : [],
      details: Array.isArray(parsed.details) ? parsed.details : [],
    };
  } catch {
    return null;
  }
}

export function saveDraft(
  shopId: string,
  subject: string,
  draft: ProductDraft,
): void {
  try {
    window.localStorage.setItem(
      draftKey(shopId, subject),
      JSON.stringify(draft),
    );
  } catch {}
}

export function clearDraft(shopId: string, subject: string): void {
  try {
    window.localStorage.removeItem(draftKey(shopId, subject));
  } catch {}
}
