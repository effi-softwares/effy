// Category and product-detail shaping. No HTTP, no SQL. The customer projection never exposes
// which shop fulfils a product (019 FR-038).
import { imageWidthsField } from "@effy/edge-shared";
import { productOffer } from "@effy/edge-shared/promotions";
import {
  unitPrice,
  type MediaDTO,
  type OptionDTO,
  type ProductAttributeGroupDTO,
  type ProductBadge,
  type StorefrontCategoryDTO,
  type StorefrontProductDetailDTO,
  type StorefrontVariantDTO,
} from "@effy/shared-types";

import { imageUrl, type ImageAddress } from "../lib/cards";
import { isUuid } from "../lib/request";
import type { AttrRow, CatalogRepository } from "./repository";

const joinNonEmpty = (vals: readonly string[] | null): string => (vals ?? []).filter((v) => v !== "").join(", ");

/** Render the populated value column per the attribute's data type. Empty means "show nothing". */
export function formatAttrValue(row: AttrRow): string {
  switch (row.data_type) {
    case "boolean":
      return row.value_boolean === null ? "" : row.value_boolean ? "Yes" : "No";
    case "number":
      if (row.value_number === null) return "";
      return row.unit ? `${row.value_number} ${row.unit}` : row.value_number;
    case "multi_select":
      return joinNonEmpty(row.value_options);
    default: // short_text, long_text, single_select
      return row.value_text ?? joinNonEmpty(row.value_options);
  }
}

/** Format each value by its data type and group by (contiguous) group label. Never cards. */
export function groupAttributes(rows: readonly AttrRow[]): ProductAttributeGroupDTO[] {
  const groups: ProductAttributeGroupDTO[] = [];
  for (const row of rows) {
    const value = formatAttrValue(row);
    if (value === "") continue;
    const last = groups[groups.length - 1];
    if (last && last.groupLabel === row.group_label) last.items.push({ label: row.label, value });
    else groups.push({ groupLabel: row.group_label, items: [{ label: row.label, value }] });
  }
  return groups;
}

export function createCatalogService(repo: CatalogRepository, imageAddress: ImageAddress = imageUrl) {
  return {
    async categories(): Promise<StorefrontCategoryDTO[]> {
      return Promise.all(
        (await repo.categories()).map(async (c) => ({
          key: c.key,
          name: c.name,
          parentKey: c.parent_key,
          productCount: c.product_count,
          // Null when no product in the category has media — the client renders a brand tile.
          imageUrl: await imageAddress(c.image_key),
          ...imageWidthsField(c.image_widths),
        })),
      );
    },

    /**
     * The full product page; null → the handler answers 404.
     *
     * ⚠ An id that is not a uuid is NOT FOUND, decided here before the database is asked (070
     * FR-025). Sent at a uuid column it would raise, and a truncated paste or a stale deep link
     * would be reported as the service being unavailable.
     */
    async productDetail(id: string): Promise<StorefrontProductDetailDTO | null> {
      if (!isUuid(id)) return null;
      const row = await repo.productPage(id);
      if (!row) return null;
      const { media: mediaRows, attributes: attrRows, category_path: categoryPath } = row;

      // A missing image never blanks the page: it is dropped from the gallery.
      const gallery: MediaDTO[] = (
        await Promise.all(
          mediaRows.map(async (m) => ({ imageUrl: await imageAddress(m.storage_key), ...imageWidthsField(m.image_widths), alt: m.alt_text })),
        )
      ).flatMap((m) => (m.imageUrl === null ? [] : [{ ...m, imageUrl: m.imageUrl }]));

      // 098 — the variants a shopper may choose between, each priced and judged on its own.
      const variants: StorefrontVariantDTO[] = await Promise.all(
        row.variants.map(async (v) => ({
          id: String(v.id),
          optionValueIds: [v.option1 === null ? null : String(v.option1), v.option2 === null ? null : String(v.option2)] as [string | null, string | null],
          label: v.label,
          priceAmount: v.price_amount,
          compareAtAmount: v.compare_at_amount,
          unitPrice: unitPrice(v.price_amount, v.pack_quantity, v.pack_unit, row.unit_basis),
          available: v.available,
          imageUrl: await imageAddress(v.storage_key),
          ...imageWidthsField(v.image_widths),
        })),
      );
      const options: OptionDTO[] = row.options
        .map((o) => ({
          id: String(o.id),
          position: Number(o.position),
          name: o.name,
          values: o.values.map((x) => ({ id: String(x.id), value: x.value, position: Number(x.position) })),
        }))
        .filter((o) => o.values.length > 0);
      // FR-014 — open on the first variant that can be bought, else the first. A link that names a
      // variant is honoured by the CLIENT (it holds the list), so this response stays one cacheable
      // document per product.
      const defaultVariant = variants.find((v) => v.available) ?? variants[0];
      if (!defaultVariant) return null; // a product with no active variant is not on sale
      const shown = variants.reduce((min, v) => (Number(v.priceAmount) < Number(min.priceAmount) ? v : min), variants[0]!);

      const badges: ProductBadge[] = [];
      if (row.compare_at_amount !== null) badges.push("on_sale");
      if (row.is_new) badges.push("new");

      return {
        id: row.id,
        name: row.name,
        brand: row.brand,
        // The primary gallery image doubles as the card image.
        imageUrl: gallery[0]?.imageUrl ?? null,
        ...imageWidthsField(gallery[0]?.imageWidths),
        priceAmount: row.price_amount,
        currency: row.currency,
        compareAtAmount: row.compare_at_amount,
        ...(row.offer ? { offer: productOffer(row.offer) } : {}),
        badges,
        // ⚠ 054: computed, not assumed. The page renders for an out-of-stock product and says so.
        available: row.available,
        // The long description, falling back to the (mandatory) short one.
        longDescription: row.long_description ? row.long_description : row.short_description,
        gallery,
        attributes: groupAttributes(attrRows),
        categoryPath,
        categoryKey: row.primary_category_key,
        priceVaries: new Set(variants.map((v) => Number(v.priceAmount))).size > 1,
        variantId: defaultVariant.id,
        variantCount: variants.length,
        unitPrice: shown.unitPrice,
        options,
        variants,
        defaultVariantId: defaultVariant.id,
        unitBasis: row.unit_basis,
      };
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
