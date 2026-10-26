// The customer projection never says which shop fulfils a product, nor any internal-only detail.
import { imageWidthsField } from "@effy/edge-shared";
import { productOffer } from "@effy/edge-shared/promotions";
import {
  formatAttributeValue,
  PACK_SIZE_OPTION_NAME,
  unitPrice,
  type DetailValue,
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
import type { CatalogRepository, DetailValueRow } from "./repository";

function valueOf(row: DetailValueRow): DetailValue | null {
  if (row.value_text !== null) return { text: row.value_text };
  if (row.value_number !== null) return { number: row.value_number, unit: row.value_unit };
  if (row.value_boolean !== null) return { boolean: row.value_boolean };
  if (row.values !== null) return { valueIds: row.values.map((v) => String(v.id)) };
  if (row.value_date !== null) return { date: row.value_date };
  if (row.value_time !== null) return { time: row.value_time };
  return null;
}

/**
 * One variant's details: the product's values with this variant's own in their place, grouped by section in
 * form order (a section comes where its first row comes). Empty values are left out.
 */
export function variantDetails(rows: readonly DetailValueRow[], variantId: string): ProductAttributeGroupDTO[] {
  const chosen = new Map<string, DetailValueRow>();
  for (const r of rows) {
    if (r.variant_id === null && !chosen.has(r.attribute_id)) chosen.set(r.attribute_id, r);
    if (r.variant_id !== null && String(r.variant_id) === variantId) chosen.set(r.attribute_id, r);
  }
  const sections = new Map<string, { first: number; items: { position: number; name: string; label: string; value: string }[] }>();
  for (const r of chosen.values()) {
    const value = valueOf(r);
    if (!value) continue;
    const text = formatAttributeValue({ inputType: r.input_type, values: (r.values ?? []).map((v) => ({ id: String(v.id), label: v.label })) }, value);
    if (text === "") continue;
    const section = sections.get(r.section) ?? { first: Number(r.position), items: [] };
    section.first = Math.min(section.first, Number(r.position));
    section.items.push({ position: Number(r.position), name: r.name, label: r.name, value: text });
    sections.set(r.section, section);
  }
  return [...sections.entries()]
    .sort(([ta, a], [tb, b]) => a.first - b.first || ta.localeCompare(tb))
    .map(([groupLabel, sec]) => ({
      groupLabel,
      items: sec.items.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)).map(({ label, value }) => ({ label, value })),
    }));
}

export function createCatalogService(repo: CatalogRepository, imageAddress: ImageAddress = imageUrl) {
  return {
    async categories(): Promise<StorefrontCategoryDTO[]> {
      return Promise.all(
        (await repo.categories()).map(async (c) => ({
          key: c.key,
          name: c.name,
          parentKey: c.parent_key,
          depth: Number(c.depth),
          isLeaf: c.is_leaf,
          icon: c.icon,
          productCount: c.product_count,
          // The category's own picture, else a product's; null renders a brand tile.
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
      const { media: mediaRows, details, category_path: categoryPath } = row;

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
          details: variantDetails(details, String(v.id)),
        })),
      );
      const options: OptionDTO[] = row.options
        .map((o) => ({
          id: String(o.id),
          position: Number(o.position),
          kind: o.kind,
          attributeId: o.attribute_id === null ? null : String(o.attribute_id),
          name: o.kind === "pack_size" ? PACK_SIZE_OPTION_NAME : (o.name ?? "Option"),
          values: o.values.map((x) => ({
            id: String(x.id), value: x.value, position: Number(x.position),
            allowedValueId: x.allowed_value_id === null ? null : String(x.allowed_value_id),
          })),
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
        ageRestricted: row.age_restricted,
        longDescription: row.long_description ? row.long_description : row.short_description,
        gallery,
        categoryPath: categoryPath ?? [],
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
