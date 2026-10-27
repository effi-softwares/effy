import {
  formRows,
  validateDetails,
  type CategoryFormDTO,
} from "@effy/shared-types";

import type { ProductDraft } from "./draft";
import {
  basicsComplete,
  draftMissing,
  draftVariants,
  factsComplete,
  optionAttributeIds,
} from "./validation";
import { variantSetValid } from "./variants";

export const STEPS = [
  {
    title: "Name & category",
    hint: "What it is called and where shoppers find it; the category decides the details asked next.",
  },
  {
    title: "Sizes & prices",
    hint: "Set the price, or add options such as pack size or flavour and price each one.",
  },
  {
    title: "Image",
    hint: "Add one photo, used for this product everywhere customers see it.",
  },
  {
    title: "Details",
    hint: "Fill in what this category asks for; required ones are marked.",
  },
  {
    title: "Review",
    hint: "Check everything, then submit; it goes on sale once Effy approves it.",
  },
] as const;

export const SIZES_STEP = 1;
export const DETAILS_STEP = 3;

export function canAdvance(
  step: number,
  draft: ProductDraft,
  form: CategoryFormDTO | undefined,
  hasImage: boolean,
): boolean {
  switch (step) {
    case 0:
      return basicsComplete(draft) && !!form && form.isLeaf;
    case 1:
      return variantSetValid(draft.variantSet);
    case 2:
      return hasImage;
    case 3:
      return (
        !!form &&
        factsComplete(draft.facts) &&
        validateDetails(
          formRows(form),
          draft.details,
          draftVariants(draft, form),
          {
            optionAttributeIds: optionAttributeIds(draft),
          },
        ).length === 0 &&
        draftMissing(form, draft).length === 0
      );
    default:
      return true;
  }
}

const PRICE = /^\d+(\.\d{1,2})?$/;

export function previewPrice(draft: ProductDraft): string {
  const prices = draft.variantSet.variants
    .map((v) => v.shopPriceAmount.trim())
    .filter((p) => PRICE.test(p));
  if (prices.length === 0) return "—";
  const lowest = prices.reduce((min, p) => (Number(p) < Number(min) ? p : min));
  const varies = new Set(prices.map(Number)).size > 1;
  return `${varies ? "From " : ""}${lowest}`;
}
