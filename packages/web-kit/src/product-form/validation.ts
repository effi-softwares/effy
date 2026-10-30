import {
  formRows,
  missingDetails,
  validateDetails,
  type CategoryFormDTO,
  type DetailError,
  type DetailInput,
  type DetailVariant,
  type ProductFacts,
} from "@effy/shared-types";

import type { ProductDraft } from "./draft";
import { variantLabels } from "./variants";

export function isValidPrice(raw: string): boolean {
  const s = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return false;
  return Number(s) > 0;
}

/** Name, category and a short description: the first step. */
export function basicsComplete(draft: ProductDraft): boolean {
  return (
    draft.name.trim().length > 0 &&
    !!draft.primaryCategoryId &&
    draft.shortDescription.trim().length > 0
  );
}

/** Every product has a storage, a GST status and an 18+ answer from the moment it exists. */
export function factsComplete(facts: ProductFacts): boolean {
  return (
    facts.storage !== null &&
    facts.gstStatus !== null &&
    facts.ageRestricted !== null
  );
}

/** The draft's variants as the details rules see them (labelled through the leaf's form). */
export function draftVariants(
  draft: ProductDraft,
  form: Pick<CategoryFormDTO, "sections">,
): DetailVariant[] {
  return variantLabels(draft.variantSet, formRows(form));
}

/** Attributes that are this draft's variant options: their values come from the options, never the form. */
export function optionAttributeIds(draft: ProductDraft): string[] {
  return draft.variantSet.options.flatMap((o) => (o.attributeId ? [o.attributeId] : []));
}

/** Problems with what was entered, keyed `details.<key>` (and `details.<key>[<variantId>]`). */
export function detailErrors(
  form: Pick<CategoryFormDTO, "sections">,
  draft: ProductDraft,
): Record<string, string> {
  const errors: DetailError[] = validateDetails(
    formRows(form),
    draft.details,
    draftVariants(draft, form),
    {
      optionAttributeIds: optionAttributeIds(draft),
    },
  );
  return Object.fromEntries(errors.map((e) => [e.field, e.message]));
}

/** Required details still empty ("Allergens", "Allergens (Mango)"). */
export function draftMissing(
  form: Pick<CategoryFormDTO, "sections">,
  draft: ProductDraft,
): string[] {
  return missingDetails(
    formRows(form),
    draft.details,
    draftVariants(draft, form),
    {
      optionAttributeIds: optionAttributeIds(draft),
    },
  );
}

/** Replace one attribute's entry: `null` removes it (an emptied field is simply left out). */
export function setDetail(
  details: readonly DetailInput[],
  next: DetailInput | null,
  attributeId: string,
): DetailInput[] {
  const rest = details.filter((d) => d.attributeId !== attributeId);
  return next ? [...rest, next] : rest;
}

/** What is sent: a "differs by size" detail with no size filled in yet is left out. */
export function sendableDetails(
  details: readonly DetailInput[],
): DetailInput[] {
  return details.filter(
    (d) => d.value !== undefined || (d.perVariant?.length ?? 0) > 0,
  );
}
