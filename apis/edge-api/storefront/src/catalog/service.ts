// The customer projection never says which shop fulfils a product.
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

/** Empty means show nothing. */
export function formatAttrValue(row: AttrRow): string {
  switch (row.data_type) {
    case "boolean":
      return row.value_boolean === null ? "" : row.value_boolean ? "Yes" : "No";
    case "number":
      if (row.value_number === null) return "";
      return row.unit ? `${row.value_number} ${row.unit}` : row.value_number;
    case "multi_select":
      return joinNonEmpty(row.value_options);
    default:
      return row.value_text ?? joinNonEmpty(row.value_options);
  }
}

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
          // Null when no product has media; the client renders a brand tile.
          imageUrl: await imageAddress(c.image_key),
          ...imageWidthsField(c.image_widths),
        })),
      );
    },

    /** null → 404. A non-uuid id is not found, decided before the database would raise. */
    async productDetail(id: string): Promise<StorefrontProductDetailDTO | null> {
      if (!isUuid(id)) return null;
      const row = await repo.productPage(id);
      if (!row) return null;
      const { media: mediaRows, attributes: attrRows, category_path: categoryPath } = row;

      const gallery: MediaDTO[] = (
        await Promise.all(
          mediaRows.map(async (m) => ({ imageUrl: await imageAddress(m.storage_key), ...imageWidthsField(m.image_widths), alt: m.alt_text })),
        )
      ).flatMap((m) => (m.imageUrl === null ? [] : [{ ...m, imageUrl: m.imageUrl }]));

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
      // Opens on the first buyable variant; a link naming a variant is honoured by the client, so this stays cacheable.
      const defaultVariant = variants.find((v) => v.available) ?? variants[0];
      if (!defaultVariant) return null;
      const shown = variants.reduce((min, v) => (Number(v.priceAmount) < Number(min.priceAmount) ? v : min), variants[0]!);

      const badges: ProductBadge[] = [];
      if (row.compare_at_amount !== null) badges.push("on_sale");
      if (row.is_new) badges.push("new");

      return {
        id: row.id,
        name: row.name,
        brand: row.brand,
        imageUrl: gallery[0]?.imageUrl ?? null,
        ...imageWidthsField(gallery[0]?.imageWidths),
        priceAmount: row.price_amount,
        currency: row.currency,
        compareAtAmount: row.compare_at_amount,
        ...(row.offer ? { offer: productOffer(row.offer) } : {}),
        badges,
        // Computed: the page renders for an out-of-stock product and says so.
        available: row.available,
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
