import { GST_STATUS_WORDS, UNIT_BASIS_LABELS, variantLabel } from "@effy/shared-types";
import type {
  AttributeDataType,
  ProductAttributeValueDTO,
  ProductChangeProposalDTO,
  ShopReviewState,
} from "@effy/shared-types";

import type { CatalogSchema, ProductDetail } from "./model";

/**
 * Review state, as a shop is shown it — pure, no React.
 *
 * Effy approves a product before it goes on sale, and approves every later change to its details.
 * Stock is never reviewed. This file is the one place that turns the server's review state into
 * words, so the catalog table, the product header and the review panel cannot say different things.
 */

export type ReviewTone = "brand" | "warning" | "muted";

export interface ReviewChip {
  label: string;
  tone: ReviewTone;
}

/**
 * The chip for a review state, or null when there is nothing to say.
 *
 * `draft` and `live` say nothing. The lifecycle chip beside this one already reads "draft" or
 * "active"; a second chip repeating it is noise on every row of a table that is mostly live products.
 */
export function reviewChip(state: ShopReviewState | undefined): ReviewChip | null {
  switch (state) {
    case "in_review":
      return { label: "In review", tone: "brand" };
    case "sent_back":
      return { label: "Sent back", tone: "warning" };
    case "live_change_pending":
      return { label: "Change in review", tone: "brand" };
    case "live_change_sent_back":
      return { label: "Change sent back", tone: "warning" };
    default:
      return null;
  }
}

/** A product Effy has approved at least once. A reply from an older backend reads as approved. */
export function isApproved(detail: Pick<ProductDetail, "reviewState" | "status">): boolean {
  if (detail.reviewState === undefined) return detail.status !== "draft";
  return detail.reviewState.startsWith("live");
}

/** The filter the catalog list offers. Values are the server's `reviewState` query values. */
export const REVIEW_FILTERS: readonly { value: ShopReviewState; label: string }[] = [
  { value: "in_review", label: "In review" },
  { value: "sent_back", label: "Sent back" },
  { value: "live_change_pending", label: "Change in review" },
  { value: "live_change_sent_back", label: "Change sent back" },
];

function inferDataType(a: NonNullable<ProductChangeProposalDTO["attributes"]>[number]): AttributeDataType {
  if (a.valueOptions != null) return "multi_select";
  if (a.valueBoolean != null) return "boolean";
  if (a.valueNumber != null) return "number";
  return "short_text";
}

/**
 * The product as the shop last left it: the live details with the pending change laid over them.
 *
 * This is what the edit dialogs open on, never what the page displays as "the product". A shop
 * that changed the name yesterday and opens the editor today must find yesterday's name in the
 * field — and a dialog seeded from the live product would silently send the old name back as the
 * new proposal for every field it re-submits whole (attributes are sent as a complete set).
 */
export function workingDetail(detail: ProductDetail): ProductDetail {
  const pending = detail.pendingChange;
  if (!pending) return detail;
  // The option/variant sets are not laid over the live rows here: those carry stock and state a
  // proposal has not got. The sizes editor opens on the proposal itself (`draftFromDetail`).
  const { attributes: proposedAttributes, options: _options, variants: _variants, ...scalars } = pending.proposed;

  let attributes: ProductAttributeValueDTO[] = detail.attributes;
  if (proposedAttributes) {
    const byId = new Map(detail.attributes.map((a) => [a.attributeId, a]));
    for (const p of proposedAttributes) {
      const live = byId.get(p.attributeId);
      byId.set(p.attributeId, {
        attributeId: p.attributeId,
        key: live?.key ?? "",
        name: live?.name ?? "",
        dataType: live?.dataType ?? inferDataType(p),
        unit: live?.unit ?? null,
        valueText: p.valueText ?? null,
        valueNumber: p.valueNumber ?? null,
        valueBoolean: p.valueBoolean ?? null,
        valueOptions: p.valueOptions ?? null,
      } as ProductAttributeValueDTO);
    }
    attributes = [...byId.values()];
  }

  return {
    ...detail,
    ...scalars,
    attributes,
    media: pending.media ?? detail.media,
  } as ProductDetail;
}

export interface ProposedRow {
  label: string;
  now: string;
  proposed: string;
}

const text = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "—" : String(v));

function categoryName(schema: CatalogSchema | undefined, id: string): string {
  type Node = { id: string; name: string; children?: Node[] };
  const walk = (nodes: readonly Node[]): string | null => {
    for (const n of nodes) {
      if (n.id === id) return n.name;
      const found = n.children ? walk(n.children) : null;
      if (found) return found;
    }
    return null;
  };
  return (schema ? walk(schema.categories as unknown as Node[]) : null) ?? "A different category";
}

/**
 * What the pending change proposes, as Now / Proposed rows — only the details that differ.
 * The price rows are the shop's price: it is the figure the shop typed.
 */
export function proposedRows(detail: ProductDetail, schema?: CatalogSchema): ProposedRow[] {
  const p = detail.pendingChange?.proposed;
  if (!p) return [];
  const rows: ProposedRow[] = [];
  const add = (label: string, now: string, proposed: string) => rows.push({ label, now, proposed });

  if (p.name !== undefined) add("Name", detail.name, p.name);
  if (p.brand !== undefined) add("Brand", text(detail.brand), text(p.brand));
  if (p.shortDescription !== undefined) add("Short description", detail.shortDescription, p.shortDescription);
  if (p.longDescription !== undefined) add("Long description", text(detail.longDescription), text(p.longDescription));
  if (p.unitBasis !== undefined) {
    add("Unit pricing", detail.unitBasis ? UNIT_BASIS_LABELS[detail.unitBasis] : "None", p.unitBasis ? UNIT_BASIS_LABELS[p.unitBasis] : "None");
  }
  // Sizes: one row per size added, removed or re-priced. Prices are the shop's: what it typed.
  if (p.options && p.variants) {
    const liveSets = detail.variants.filter((v) => v.state !== "removed");
    const live = new Map(liveSets.map((v) => [v.id, v]));
    const kept = new Set(p.variants.map((v) => v.id));
    for (const v of p.variants) {
      const label = variantLabel(p.options, v.optionValueIds) ?? "Price";
      const was = live.get(v.id);
      if (!was) add(`${label} (new)`, "—", `${detail.currency} ${v.shopPriceAmount}`);
      else if (Number(was.shopPriceAmount) !== Number(v.shopPriceAmount)) add(label, `${detail.currency} ${was.shopPriceAmount}`, `${detail.currency} ${v.shopPriceAmount}`);
      else if ((was.sku ?? "") !== (v.sku ?? "") || (was.gtin ?? "") !== (v.gtin ?? "")) add(`${label} codes`, text(was.sku ?? was.gtin), text(v.sku ?? v.gtin));
    }
    for (const v of liveSets) if (!kept.has(v.id)) add(`${v.label ?? "Variant"} (removed)`, `${detail.currency} ${v.shopPriceAmount}`, "—");
  }
  if (p.gstStatus !== undefined) add("GST", detail.gstStatus ? GST_STATUS_WORDS[detail.gstStatus] : "Not set", GST_STATUS_WORDS[p.gstStatus]);
  if (p.productTypeId !== undefined) {
    const type = schema?.productTypes.find((t) => t.id === p.productTypeId);
    add("Type", detail.typeName, type?.name ?? "A different type");
  }
  if (p.primaryCategoryId !== undefined) {
    add("Category", detail.categoryName, categoryName(schema, p.primaryCategoryId));
  }
  if (p.attributes !== undefined) {
    add("Attributes", `${detail.attributes.length} set`, `${p.attributes.length} changed`);
  }
  if (detail.pendingChange?.media) {
    add("Images", `${detail.media.length}`, `${detail.pendingChange.media.length} (changed)`);
  }
  return rows;
}
