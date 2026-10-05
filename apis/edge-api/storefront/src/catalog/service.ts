// Category and product-detail shaping. No HTTP, no SQL. The customer projection never exposes
// which shop fulfils a product (019 FR-038).
import type {
  MediaDTO,
  ProductAttributeGroupDTO,
  ProductBadge,
  StorefrontCategoryDTO,
  StorefrontProductDetailDTO,
} from "@effy/shared-types";

import { imageUrl, type Presign } from "../lib/cards";
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

export function createCatalogService(repo: CatalogRepository, presign: Presign = imageUrl) {
  return {
    async categories(): Promise<StorefrontCategoryDTO[]> {
      return Promise.all(
        (await repo.categories()).map(async (c) => ({
          key: c.key,
          name: c.name,
          parentKey: c.parent_key,
          productCount: c.product_count,
          // Null when no product in the category has media — the client renders a brand tile.
          imageUrl: await presign(c.image_key),
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
      const row = await repo.productDetail(id);
      if (!row) return null;

      const [mediaRows, attrRows, categoryPath] = await Promise.all([
        repo.productMedia(id),
        repo.productAttributes(id),
        repo.categoryPath(row.primary_category_id),
      ]);

      // A missing image never blanks the page: it is dropped from the gallery.
      const gallery: MediaDTO[] = (
        await Promise.all(mediaRows.map(async (m) => ({ imageUrl: await presign(m.storage_key), alt: m.alt_text })))
      ).filter((m): m is MediaDTO => m.imageUrl !== null);

      const badges: ProductBadge[] = [];
      if (row.compare_at_amount !== null) badges.push("on_sale");
      if (row.is_new) badges.push("new");

      return {
        id: row.id,
        name: row.name,
        brand: row.brand,
        // The primary gallery image doubles as the card image.
        imageUrl: gallery[0]?.imageUrl ?? null,
        priceAmount: row.price_amount,
        currency: row.currency,
        compareAtAmount: row.compare_at_amount,
        badges,
        // ⚠ 054: computed, not assumed. The page renders for an out-of-stock product and says so.
        available: row.available,
        // The long description, falling back to the (mandatory) short one.
        longDescription: row.long_description ? row.long_description : row.short_description,
        gallery,
        attributes: groupAttributes(attrRows),
        categoryPath,
        categoryKey: row.primary_category_key,
      };
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
