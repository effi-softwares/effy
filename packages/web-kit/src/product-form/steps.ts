import {
  formRows,
  packLabel,
  validateDetails,
  type CategoryFormDTO,
} from "@effy/shared-types";

import type { ProductDraft } from "./draft";
import { pathText } from "./model";
import {
  basicsComplete,
  draftMissing,
  draftVariants,
  factsComplete,
  isValidPrice,
  optionAttributeIds,
} from "./validation";
import { rowLabel, rowPack, variantSetValid } from "./variants";

/** The editor's steps. A console picks which it shows and in what order (back-office adds "shop" first). */
export type StepKey = "shop" | "basics" | "image" | "sizes" | "details" | "review";

export const STEP_WORDS: Record<StepKey, { title: string; hint: string }> = {
  shop: {
    title: "Shop & margin",
    hint: "Whose product this is, and what Effy adds to the shop's price.",
  },
  basics: {
    title: "Name & category",
    hint: "What it is called and where shoppers find it. The category decides the details asked for later.",
  },
  image: {
    title: "Photo",
    hint: "One clear photo, used everywhere shoppers see this product.",
  },
  sizes: {
    title: "Variants & prices",
    hint: "Sell it as one product, or add variants such as size, flavour or colour and price each one.",
  },
  details: {
    title: "Details",
    hint: "What this category asks for. Shoppers filter and compare on these.",
  },
  review: {
    title: "Review",
    hint: "Check it over before it goes to Effy.",
  },
};

/** The shop's steps. The photo comes second so the preview has a picture early. */
export const SHOP_STEPS: readonly StepKey[] = [
  "basics",
  "image",
  "sizes",
  "details",
  "review",
];

export type StepStatus = "current" | "done" | "issue" | "todo";

/** One step as the rail draws it. */
export interface StepState {
  key: StepKey;
  title: string;
  /** What is in the step so far, or what it asks for. */
  summary: string;
  status: StepStatus;
}

export interface StepContext {
  form: CategoryFormDTO | undefined;
  hasImage: boolean;
}

/** Whether a step holds everything it needs. The review step is never "done": it is where you finish. */
export function stepComplete(
  key: StepKey,
  draft: ProductDraft,
  { form, hasImage }: StepContext,
): boolean {
  switch (key) {
    case "basics":
      return basicsComplete(draft) && (!form || form.isLeaf);
    case "image":
      return hasImage;
    case "sizes":
      return variantSetValid(draft.variantSet);
    case "details":
      return (
        !!form &&
        factsComplete(draft.facts) &&
        validateDetails(
          formRows(form),
          draft.details,
          draftVariants(draft, form),
          { optionAttributeIds: optionAttributeIds(draft) },
        ).length === 0 &&
        draftMissing(form, draft).length === 0
      );
    default:
      return false;
  }
}

/** What a step holds so far, for the rail ("2 variants · From $4.60"). */
export function stepSummary(
  key: StepKey,
  draft: ProductDraft,
  { form, hasImage }: StepContext,
): string {
  switch (key) {
    case "basics": {
      const name = draft.name.trim();
      const leaf = form?.path[form.path.length - 1];
      return name ? [name, leaf].filter(Boolean).join(" · ") : "Name, brand, category";
    }
    case "image":
      return hasImage ? "Photo added" : "One clear photo";
    case "sizes": {
      const priced = draft.variantSet.variants.filter((v) =>
        isValidPrice(v.shopPriceAmount),
      );
      if (priced.length === 0) return "One price, or one per variant";
      if (draft.variantSet.variants.length === 1) {
        const pack = rowPack(draft.variantSet, draft.variantSet.variants[0]!);
        const size =
          pack.packUnit !== "" ? packLabel(pack.packQuantity.trim(), pack.packUnit) : null;
        return [money(priced[0]!.shopPriceAmount), size].filter(Boolean).join(" · ");
      }
      return `${draft.variantSet.variants.length} variants · ${previewPrice(draft)}`;
    }
    case "details": {
      if (!form) return "Asked once the category is chosen";
      const left = draftMissing(form, draft).length;
      return left === 0 ? "Required details filled" : `${left} required left`;
    }
    default:
      return "";
  }
}

/** The rail's rows: done, the one you are on, one you left with something missing, or not reached yet. */
export function stepStates(
  keys: readonly StepKey[],
  current: number,
  visited: ReadonlySet<StepKey>,
  draft: ProductDraft,
  ctx: StepContext,
  overrides: Partial<Record<StepKey, { complete: boolean; summary: string }>> = {},
): StepState[] {
  return keys.map((key, i) => {
    const own = overrides[key];
    const complete = own ? own.complete : stepComplete(key, draft, ctx);
    const status: StepStatus =
      i === current
        ? "current"
        : complete
          ? "done"
          : visited.has(key) && key !== "review"
            ? "issue"
            : "todo";
    return {
      key,
      title: STEP_WORDS[key].title,
      summary: own ? own.summary : stepSummary(key, draft, ctx),
      status,
    };
  });
}

/** One line of the "ready to send" checklist; each opens the step that holds it. */
export interface ReadinessItem {
  key: string;
  label: string;
  ok: boolean;
  step: StepKey;
  /** Not needed to save (back-office's photo and details). */
  optional?: boolean;
}

export function readiness(
  draft: ProductDraft,
  { form, hasImage }: StepContext,
  { optional = [] }: { optional?: readonly StepKey[] } = {},
): ReadinessItem[] {
  const missing = form ? draftMissing(form, draft).length : null;
  const items: Omit<ReadinessItem, "optional">[] = [
    { key: "name", label: "Name", ok: draft.name.trim() !== "", step: "basics" },
    { key: "category", label: "Category", ok: !!draft.primaryCategoryId, step: "basics" },
    {
      key: "short",
      label: "Short description",
      ok: draft.shortDescription.trim() !== "",
      step: "basics",
    },
    { key: "image", label: "Photo", ok: hasImage, step: "image" },
    {
      key: "sizes",
      label: draft.variantSet.variants.length > 1 ? "Variants and prices" : "Price",
      ok: variantSetValid(draft.variantSet),
      step: "sizes",
    },
    {
      key: "details",
      label:
        missing === null || missing === 0
          ? "Required details"
          : `Required details · ${missing} left`,
      ok: stepComplete("details", draft, { form, hasImage }),
      step: "details",
    },
  ];
  return items.map((item) => ({ ...item, optional: optional.includes(item.step) }));
}

const PRICE = /^\d+(\.\d{1,2})?$/;

/** A price as shoppers read it. */
export const money = (amount: string) => `$${Number(amount).toFixed(2)}`;

/**
 * The lowest price ("From $4.60" when variants differ), or "" before one is set. `shown` turns a shop price into
 * the price to show - back-office adds its margin.
 */
export function previewPrice(
  draft: ProductDraft,
  shown: (shopPrice: string) => string | null = (p) => p,
): string {
  const prices = draft.variantSet.variants
    .map((v) => v.shopPriceAmount.trim())
    .filter((p) => PRICE.test(p))
    .map(shown)
    .filter((p): p is string => p !== null);
  if (prices.length === 0) return "";
  const lowest = prices.reduce((min, p) => (Number(p) < Number(min) ? p : min));
  const varies = new Set(prices.map(Number)).size > 1;
  return `${varies ? "From " : ""}${money(lowest)}`;
}

/** Each size's name, price and unit, as the preview lists them. */
export function previewSizes(
  draft: ProductDraft,
  form: CategoryFormDTO | undefined,
): { id: string; label: string; price: string }[] {
  const rows = form ? formRows(form) : [];
  const set = draft.variantSet;
  return set.variants.map((r) => {
    const pack = rowPack(set, r);
    const size = pack.packUnit !== "" ? packLabel(pack.packQuantity.trim(), pack.packUnit) : null;
    return {
      id: r.id,
      label: set.options.length > 0 ? rowLabel(set, r, rows) : (size ?? "One size"),
      price: r.shopPriceAmount.trim(),
    };
  });
}

/** The category path as shoppers browse it, or null before one is chosen. */
export const categoryPathText = (form: CategoryFormDTO | undefined) =>
  form ? pathText(form.path) : null;
