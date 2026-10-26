// The taxonomy's back-office reads, and the audit row every write leaves (101). Writes go through the one
// writer, @effy/edge-shared/catalog/taxonomy.ts.
import { query, type Queryable } from "@effy/edge-shared";
import type { AttributeDTO, AttributeLevel, CategoryIcon, OwnAttachmentDTO, TaxonomyCategoryDTO, TaxonomyStatus } from "@effy/shared-types";

import { categoryImageUrl } from "./images";

interface CategoryRow {
  id: string;
  parent_id: string | null;
  key: string;
  name: string;
  position: number;
  status: TaxonomyStatus;
  icon: CategoryIcon | null;
  image_key: string | null;
  synonyms: string[];
  default_storage: TaxonomyCategoryDTO["defaults"]["storage"];
  default_gst_status: TaxonomyCategoryDTO["defaults"]["gstStatus"];
  default_age_restricted: boolean | null;
  r_storage: TaxonomyCategoryDTO["defaults"]["storage"];
  r_gst_status: TaxonomyCategoryDTO["defaults"]["gstStatus"];
  r_age_restricted: boolean | null;
  resolved: boolean;
  product_count: number;
  placement_count: number;
}

/** Every category, retired ones included, with what applies after inheritance and what is filed beneath. */
export async function readTree(db: Queryable = { query }): Promise<TaxonomyCategoryDTO[]> {
  const r = await db.query<CategoryRow>(
    `SELECT c.id::text, c.parent_id::text, c.key, c.name, c."position", c.status, c.icon, c.image_key, c.synonyms,
            c.default_storage, c.default_gst_status, c.default_age_restricted,
            r.storage AS r_storage, r.gst_status AS r_gst_status, r.age_restricted AS r_age_restricted, r.category_id IS NOT NULL AS resolved,
            COALESCE((SELECT count(*) FROM public.product p
                       WHERE p.status <> 'archived'
                         AND (p.primary_category_id = c.id
                              OR p.primary_category_id IN (SELECT a.category_id FROM public.category_ancestor a WHERE a.ancestor_id = c.id))), 0)::int AS product_count,
            COALESCE((SELECT count(*) FROM public.product_placement pp
                       WHERE pp.category_id = c.id
                          OR pp.category_id IN (SELECT a.category_id FROM public.category_ancestor a WHERE a.ancestor_id = c.id)), 0)::int AS placement_count
       FROM public.category c
       LEFT JOIN public.category_resolved r ON r.category_id = c.id
      ORDER BY c.parent_id NULLS FIRST, c."position", c.name`,
  );
  return r.rows.map((c) => ({
    id: c.id,
    parentId: c.parent_id,
    key: c.key,
    name: c.name,
    position: Number(c.position),
    status: c.status,
    icon: c.icon,
    imageKey: c.image_key,
    imageUrl: categoryImageUrl(c.image_key),
    synonyms: c.synonyms,
    defaults: { storage: c.default_storage, gstStatus: c.default_gst_status, ageRestricted: c.default_age_restricted },
    resolved: c.resolved ? { storage: c.r_storage, gstStatus: c.r_gst_status, ageRestricted: c.r_age_restricted } : null,
    productCount: Number(c.product_count),
    placementCount: Number(c.placement_count),
  }));
}

export async function readCategory(id: string, db: Queryable = { query }): Promise<TaxonomyCategoryDTO | null> {
  return (await readTree(db)).find((c) => c.id === id) ?? null;
}

interface AttributeRow {
  id: string;
  key: string;
  name: string;
  help_text: string | null;
  input_type: AttributeDTO["inputType"];
  unit_family: AttributeDTO["unitFamily"];
  units: string[] | null;
  min_value: string | null;
  max_value: string | null;
  decimals: number | null;
  max_length: number | null;
  filterable: boolean;
  customer_visible: boolean;
  varies_by_variant: boolean;
  variant_option: boolean;
  status: TaxonomyStatus;
  values: { id: string; label: string; position: number; status: TaxonomyStatus; usage: number }[] | null;
  categories: number;
  products: number;
}

const ATTRIBUTE_SELECT = `
  SELECT ad.id::text, ad.key, ad.name, ad.help_text, ad.input_type, ad.unit_family, ad.units, ad.min_value::text, ad.max_value::text,
         ad.decimals, ad.max_length, ad.filterable, ad.customer_visible, ad.varies_by_variant, ad.variant_option, ad.status,
         (SELECT json_agg(json_build_object('id', v.id, 'label', v.label, 'position', v."position", 'status', v.status,
                 'usage', (SELECT count(DISTINCT pav.product_id) FROM public.product_attribute_value pav WHERE v.id = ANY(pav.allowed_value_ids)))
                 ORDER BY v."position", v.label)
            FROM public.attribute_allowed_value v WHERE v.attribute_definition_id = ad.id) AS values,
         (SELECT count(*) FROM public.category_attribute ca WHERE ca.attribute_id = ad.id AND NOT ca.hidden)::int AS categories,
         (SELECT count(DISTINCT pav.product_id) FROM public.product_attribute_value pav WHERE pav.attribute_definition_id = ad.id)::int AS products
    FROM public.attribute_definition ad`;

function toAttribute(a: AttributeRow): AttributeDTO {
  return {
    id: a.id,
    key: a.key,
    name: a.name,
    helpText: a.help_text,
    inputType: a.input_type,
    unitFamily: a.unit_family,
    units: a.units ?? [],
    min: a.min_value,
    max: a.max_value,
    decimals: a.decimals === null ? null : Number(a.decimals),
    maxLength: a.max_length === null ? null : Number(a.max_length),
    filterable: a.filterable,
    customerVisible: a.customer_visible,
    variesByVariant: a.varies_by_variant,
    variantOption: a.variant_option,
    status: a.status,
    values: (a.values ?? []).map((v) => ({ id: String(v.id), label: v.label, position: Number(v.position), status: v.status, usage: Number(v.usage) })),
    usage: { categories: Number(a.categories), products: Number(a.products) },
  };
}

export async function readAttributes(filter: { status: TaxonomyStatus | null; q: string | null }, db: Queryable = { query }): Promise<AttributeDTO[]> {
  const r = await db.query<AttributeRow>(
    `${ATTRIBUTE_SELECT}
      WHERE ($1::text IS NULL OR ad.status = $1) AND ($2::text IS NULL OR ad.name ILIKE '%' || $2 || '%')
      ORDER BY ad.name`,
    [filter.status, filter.q],
  );
  return r.rows.map(toAttribute);
}

export async function readAttribute(id: string, db: Queryable = { query }): Promise<AttributeDTO | null> {
  const r = await db.query<AttributeRow>(`${ATTRIBUTE_SELECT} WHERE ad.id = $1`, [id]);
  return r.rows[0] ? toAttribute(r.rows[0]) : null;
}

/** A category's own attachments, in order. */
export async function readOwnAttachments(categoryId: string, db: Queryable = { query }): Promise<OwnAttachmentDTO[]> {
  const r = await db.query<{ attribute_id: string; name: string; level: AttributeLevel | null; hidden: boolean; section: string | null; position: number | null }>(
    `SELECT ca.attribute_id::text, ad.name, ca.level, ca.hidden, ca.section, ca."position"
       FROM public.category_attribute ca JOIN public.attribute_definition ad ON ad.id = ca.attribute_id
      WHERE ca.category_id = $1
      ORDER BY ca.hidden, ca.section NULLS FIRST, ca."position" NULLS FIRST, ad.name`,
    [categoryId],
  );
  return r.rows.map((a) => ({
    attributeId: a.attribute_id, name: a.name, level: a.level, hidden: a.hidden, section: a.section,
    position: a.position === null ? null : Number(a.position),
  }));
}

export type TaxonomyTarget = "category" | "attribute_definition" | "category_attribute";

/** Who changed the taxonomy is recorded only here, in the write's transaction. */
export async function audit(tx: Queryable, actorSub: string, action: string, targetType: TaxonomyTarget, targetId: string | null, detail: Record<string, unknown>): Promise<void> {
  await tx.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorSub, action, targetType, targetId, JSON.stringify(detail)],
  );
}
