// Repository layer for back-office catalog schema authority (016): raw parameterized SQL + explicit
// row → domain mapping (constitution Principle VI, no ORM). Writes the operational catalog schema
// tables (public.product_type, attribute_definition, attribute_allowed_value, product_type_attribute,
// category) and the back-office audit log (admin.audit_log, 009). Every mutation writes an audit row
// inside the SAME transaction as the change it records (verified 009 pattern). In-use guards (FR-006)
// refuse a retire/remove that would strand existing product data.
import type { PoolClient } from "pg";

import { query, withTransaction } from "@effy/edge-shared";

import {
  type AllowedValue,
  type AttributeDataType,
  type AttributeDefinition,
  type AttributeValidation,
  type Assignment,
  type Category,
  CatalogError,
  type ProductType,
  type SchemaStatus,
} from "./types";

type TargetType = "product_type" | "attribute_definition" | "category";

// ── Row shapes (internal; never exported) ───────────────────────────────────────────────────────

interface ProductTypeRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: SchemaStatus;
  created_at: Date;
  updated_at: Date;
}

interface AttributeRow {
  id: string;
  key: string;
  name: string;
  data_type: AttributeDataType;
  unit: string | null;
  help_text: string | null;
  validation: AttributeValidation | null;
  status: SchemaStatus;
  created_at: Date;
  updated_at: Date;
}

interface AllowedValueRow {
  id: string;
  attribute_definition_id: string;
  value: string;
  label: string;
  display_order: number;
}

interface AssignmentRow {
  product_type_id: string;
  attribute_id: string;
  key: string;
  name: string;
  data_type: AttributeDataType;
  unit: string | null;
  help_text: string | null;
  validation: AttributeValidation | null;
  is_mandatory: boolean;
  display_order: number;
  group_label: string | null;
}

interface CategoryRow {
  id: string;
  parent_id: string | null;
  key: string;
  name: string;
  display_order: number;
  status: SchemaStatus;
}

// ── Audit (written inside the mutation's transaction) ────────────────────────────────────────────

async function insertAudit(
  client: PoolClient,
  actorSub: string,
  action: string,
  targetType: TargetType,
  targetId: string | null,
  detail: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
          VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorSub, action, targetType, targetId, JSON.stringify(detail)],
  );
}

// Map a Postgres unique_violation (23505) to a domain conflict, else rethrow.
function asConflict(err: unknown, message: string): CatalogError {
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
    return new CatalogError("conflict", message);
  }
  throw err;
}

// ── Mappers ───────────────────────────────────────────────────────────────────────────────────

function mapAllowed(row: AllowedValueRow): AllowedValue {
  return { id: row.id, value: row.value, label: row.label, displayOrder: row.display_order };
}

function mapAttribute(row: AttributeRow, allowed: AllowedValueRow[]): AttributeDefinition {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    dataType: row.data_type,
    unit: row.unit,
    helpText: row.help_text,
    validation: row.validation,
    status: row.status,
    allowedValues: allowed
      .filter((a) => a.attribute_definition_id === row.id)
      .sort((a, b) => a.display_order - b.display_order)
      .map(mapAllowed),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapAssignment(row: AssignmentRow, allowed: AllowedValueRow[]): Assignment {
  return {
    attributeId: row.attribute_id,
    key: row.key,
    name: row.name,
    dataType: row.data_type,
    unit: row.unit,
    helpText: row.help_text,
    validation: row.validation,
    allowedValues: allowed
      .filter((a) => a.attribute_definition_id === row.attribute_id)
      .sort((a, b) => a.display_order - b.display_order)
      .map(mapAllowed),
    isMandatory: row.is_mandatory,
    displayOrder: row.display_order,
    groupLabel: row.group_label,
  };
}

function mapType(row: ProductTypeRow, assignments: Assignment[]): ProductType {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    status: row.status,
    attributes: assignments.sort((a, b) => a.displayOrder - b.displayOrder),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    parentId: row.parent_id,
    key: row.key,
    name: row.name,
    displayOrder: row.display_order,
    status: row.status,
  };
}

// ── Shared read helpers ─────────────────────────────────────────────────────────────────────────

/** All allowed-value rows for a set of attribute ids (or all, when ids is null). */
async function loadAllowedValues(attributeIds: string[] | null): Promise<AllowedValueRow[]> {
  const res = await query<AllowedValueRow>(
    `SELECT id, attribute_definition_id, value, label, display_order
       FROM public.attribute_allowed_value
      WHERE ($1::uuid[] IS NULL OR attribute_definition_id = ANY($1))
      ORDER BY display_order`,
    [attributeIds],
  );
  return res.rows;
}

/** All assignment rows (joined to the definition) for a set of type ids (or all, when null). */
async function loadAssignments(typeIds: string[] | null): Promise<AssignmentRow[]> {
  const res = await query<AssignmentRow>(
    `SELECT pta.product_type_id, ad.id AS attribute_id, ad.key, ad.name, ad.data_type,
            ad.unit, ad.help_text, ad.validation,
            pta.is_mandatory, pta.display_order, pta.group_label
       FROM public.product_type_attribute pta
       JOIN public.attribute_definition ad ON ad.id = pta.attribute_definition_id
      WHERE ($1::uuid[] IS NULL OR pta.product_type_id = ANY($1))
      ORDER BY pta.display_order`,
    [typeIds],
  );
  return res.rows;
}

async function assemblyForTypes(typeRows: ProductTypeRow[]): Promise<ProductType[]> {
  if (typeRows.length === 0) return [];
  const typeIds = typeRows.map((t) => t.id);
  const assignmentRows = await loadAssignments(typeIds);
  const attrIds = [...new Set(assignmentRows.map((a) => a.attribute_id))];
  const allowed = attrIds.length > 0 ? await loadAllowedValues(attrIds) : [];
  return typeRows.map((t) =>
    mapType(
      t,
      assignmentRows.filter((a) => a.product_type_id === t.id).map((a) => mapAssignment(a, allowed)),
    ),
  );
}

// ── Product types ───────────────────────────────────────────────────────────────────────────────

export async function listProductTypes(): Promise<ProductType[]> {
  const res = await query<ProductTypeRow>(
    `SELECT id, key, name, description, status, created_at, updated_at
       FROM public.product_type ORDER BY name`,
  );
  return assemblyForTypes(res.rows);
}

export async function getProductType(id: string): Promise<ProductType | null> {
  const res = await query<ProductTypeRow>(
    `SELECT id, key, name, description, status, created_at, updated_at
       FROM public.product_type WHERE id = $1`,
    [id],
  );
  const row = res.rows[0];
  if (!row) return null;
  return (await assemblyForTypes([row]))[0]!;
}

export async function createProductType(
  input: { key: string; name: string; description: string | null },
  actorSub: string,
): Promise<ProductType> {
  const id = await withTransaction(async (client) => {
    let newId: string;
    try {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO public.product_type (key, name, description) VALUES ($1, $2, $3) RETURNING id`,
        [input.key, input.name, input.description],
      );
      newId = ins.rows[0]!.id;
    } catch (err) {
      throw asConflict(err, "a product type with this key already exists");
    }
    await insertAudit(client, actorSub, "product_type.create", "product_type", newId, {
      key: input.key,
    });
    return newId;
  });
  return (await getProductType(id))!;
}

export async function updateProductType(
  id: string,
  values: { name: string; description: string | null },
  actorSub: string,
): Promise<ProductType> {
  await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `UPDATE public.product_type SET name = $2, description = $3, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [id, values.name, values.description],
    );
    if (!res.rows[0]) throw new CatalogError("not_found", "product type not found");
    await insertAudit(client, actorSub, "product_type.update", "product_type", id, {
      name: values.name,
    });
  });
  return (await getProductType(id))!;
}

export async function setProductTypeStatus(
  id: string,
  status: SchemaStatus,
  actorSub: string,
): Promise<ProductType> {
  // Retiring a product type never corrupts existing products (data-model §2.1) — no in-use guard.
  await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `UPDATE public.product_type SET status = $2, updated_at = now() WHERE id = $1 RETURNING id`,
      [id, status],
    );
    if (!res.rows[0]) throw new CatalogError("not_found", "product type not found");
    await insertAudit(client, actorSub, "product_type.retire", "product_type", id, { status });
  });
  return (await getProductType(id))!;
}

export async function assignAttribute(
  typeId: string,
  input: { attributeId: string; isMandatory: boolean; displayOrder: number; groupLabel: string | null },
  actorSub: string,
): Promise<ProductType> {
  await withTransaction(async (client) => {
    const type = await client.query<{ id: string }>(
      `SELECT id FROM public.product_type WHERE id = $1`,
      [typeId],
    );
    if (!type.rows[0]) throw new CatalogError("not_found", "product type not found");
    const attr = await client.query<{ id: string }>(
      `SELECT id FROM public.attribute_definition WHERE id = $1`,
      [input.attributeId],
    );
    if (!attr.rows[0]) throw new CatalogError("not_found", "attribute not found");
    try {
      await client.query(
        `INSERT INTO public.product_type_attribute
             (product_type_id, attribute_definition_id, is_mandatory, display_order, group_label)
             VALUES ($1, $2, $3, $4, $5)`,
        [typeId, input.attributeId, input.isMandatory, input.displayOrder, input.groupLabel],
      );
    } catch (err) {
      throw asConflict(err, "this attribute is already assigned to the type");
    }
    await insertAudit(client, actorSub, "product_type.update", "product_type", typeId, {
      assigned: input.attributeId,
    });
  });
  return (await getProductType(typeId))!;
}

export async function updateAssignment(
  typeId: string,
  attributeId: string,
  patch: { isMandatory: boolean; displayOrder: number; groupLabel: string | null },
  actorSub: string,
): Promise<ProductType> {
  await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `UPDATE public.product_type_attribute
          SET is_mandatory = $3, display_order = $4, group_label = $5
        WHERE product_type_id = $1 AND attribute_definition_id = $2 RETURNING id`,
      [typeId, attributeId, patch.isMandatory, patch.displayOrder, patch.groupLabel],
    );
    if (!res.rows[0]) throw new CatalogError("not_found", "assignment not found");
    await insertAudit(client, actorSub, "product_type.update", "product_type", typeId, {
      updatedAssignment: attributeId,
    });
  });
  return (await getProductType(typeId))!;
}

export async function unassignAttribute(
  typeId: string,
  attributeId: string,
  actorSub: string,
): Promise<ProductType> {
  await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `DELETE FROM public.product_type_attribute
        WHERE product_type_id = $1 AND attribute_definition_id = $2 RETURNING id`,
      [typeId, attributeId],
    );
    if (!res.rows[0]) throw new CatalogError("not_found", "assignment not found");
    await insertAudit(client, actorSub, "product_type.update", "product_type", typeId, {
      unassigned: attributeId,
    });
  });
  return (await getProductType(typeId))!;
}

// ── Attribute definitions ─────────────────────────────────────────────────────────────────────

export async function listAttributes(): Promise<AttributeDefinition[]> {
  const res = await query<AttributeRow>(
    `SELECT id, key, name, data_type, unit, help_text, validation, status, created_at, updated_at
       FROM public.attribute_definition ORDER BY name`,
  );
  const allowed = await loadAllowedValues(null);
  return res.rows.map((r) => mapAttribute(r, allowed));
}

export async function getAttribute(id: string): Promise<AttributeDefinition | null> {
  const res = await query<AttributeRow>(
    `SELECT id, key, name, data_type, unit, help_text, validation, status, created_at, updated_at
       FROM public.attribute_definition WHERE id = $1`,
    [id],
  );
  const row = res.rows[0];
  if (!row) return null;
  const allowed = await loadAllowedValues([id]);
  return mapAttribute(row, allowed);
}

async function upsertAllowedValues(
  client: PoolClient,
  attributeId: string,
  values: { value: string; label: string; displayOrder: number }[],
): Promise<void> {
  for (const v of values) {
    await client.query(
      `INSERT INTO public.attribute_allowed_value (attribute_definition_id, value, label, display_order)
            VALUES ($1, $2, $3, $4)
       ON CONFLICT (attribute_definition_id, value)
         DO UPDATE SET label = EXCLUDED.label, display_order = EXCLUDED.display_order`,
      [attributeId, v.value, v.label, v.displayOrder],
    );
  }
}

export async function createAttribute(
  input: {
    key: string;
    name: string;
    dataType: AttributeDataType;
    unit: string | null;
    helpText: string | null;
    validation: AttributeValidation | null;
    allowedValues: { value: string; label: string; displayOrder: number }[];
  },
  actorSub: string,
): Promise<AttributeDefinition> {
  const id = await withTransaction(async (client) => {
    let newId: string;
    try {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO public.attribute_definition (key, name, data_type, unit, help_text, validation)
              VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
        [
          input.key,
          input.name,
          input.dataType,
          input.unit,
          input.helpText,
          input.validation ? JSON.stringify(input.validation) : null,
        ],
      );
      newId = ins.rows[0]!.id;
    } catch (err) {
      throw asConflict(err, "an attribute with this key already exists");
    }
    await upsertAllowedValues(client, newId, input.allowedValues);
    await insertAudit(client, actorSub, "attribute.create", "attribute_definition", newId, {
      key: input.key,
      dataType: input.dataType,
    });
    return newId;
  });
  return (await getAttribute(id))!;
}

export async function updateAttribute(
  id: string,
  values: {
    name: string;
    unit: string | null;
    helpText: string | null;
    validation: AttributeValidation | null;
    allowedValues: { value: string; label: string; displayOrder: number }[] | null;
  },
  actorSub: string,
): Promise<AttributeDefinition> {
  await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `UPDATE public.attribute_definition
          SET name = $2, unit = $3, help_text = $4, validation = $5::jsonb, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [id, values.name, values.unit, values.helpText, values.validation ? JSON.stringify(values.validation) : null],
    );
    if (!res.rows[0]) throw new CatalogError("not_found", "attribute not found");
    // allowedValues (when supplied) upsert-only — deletion is the dedicated guarded endpoint.
    if (values.allowedValues) await upsertAllowedValues(client, id, values.allowedValues);
    await insertAudit(client, actorSub, "attribute.update", "attribute_definition", id, {
      name: values.name,
    });
  });
  return (await getAttribute(id))!;
}

/** True when any product carries a value for this attribute (retire/delete guard, FR-006). */
async function attributeInUse(client: PoolClient, attributeId: string): Promise<boolean> {
  const res = await client.query<{ n: string }>(
    `SELECT count(*) AS n FROM public.product_attribute_value WHERE attribute_definition_id = $1`,
    [attributeId],
  );
  return Number(res.rows[0]?.n ?? 0) > 0;
}

export async function setAttributeStatus(
  id: string,
  status: SchemaStatus,
  actorSub: string,
): Promise<AttributeDefinition> {
  await withTransaction(async (client) => {
    const cur = await client.query<{ id: string }>(
      `SELECT id FROM public.attribute_definition WHERE id = $1`,
      [id],
    );
    if (!cur.rows[0]) throw new CatalogError("not_found", "attribute not found");
    // Retiring an in-use attribute is blocked (FR-006). Re-activating is always allowed.
    if (status === "retired" && (await attributeInUse(client, id))) {
      throw new CatalogError("conflict", "attribute is in use by existing products; cannot retire");
    }
    await client.query(
      `UPDATE public.attribute_definition SET status = $2, updated_at = now() WHERE id = $1`,
      [id, status],
    );
    await insertAudit(client, actorSub, "attribute.retire", "attribute_definition", id, { status });
  });
  return (await getAttribute(id))!;
}

/** Remove an allowed value — blocked (409) if any product references it (FR-006). */
export async function deleteAllowedValue(
  attributeId: string,
  valueId: string,
  actorSub: string,
): Promise<AttributeDefinition> {
  await withTransaction(async (client) => {
    const val = await client.query<{ value: string }>(
      `SELECT value FROM public.attribute_allowed_value WHERE id = $1 AND attribute_definition_id = $2`,
      [valueId, attributeId],
    );
    const value = val.rows[0]?.value;
    if (!value) throw new CatalogError("not_found", "allowed value not found");
    const used = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM public.product_attribute_value
        WHERE attribute_definition_id = $1
          AND (value_text = $2 OR $2 = ANY(coalesce(value_options, '{}')))`,
      [attributeId, value],
    );
    if (Number(used.rows[0]?.n ?? 0) > 0) {
      throw new CatalogError("conflict", "this value is in use by existing products; cannot remove");
    }
    await client.query(`DELETE FROM public.attribute_allowed_value WHERE id = $1`, [valueId]);
    await insertAudit(client, actorSub, "attribute_value.remove", "attribute_definition", attributeId, {
      value,
    });
  });
  return (await getAttribute(attributeId))!;
}

// ── Categories ──────────────────────────────────────────────────────────────────────────────────

export async function listCategories(): Promise<Category[]> {
  const res = await query<CategoryRow>(
    `SELECT id, parent_id, key, name, display_order, status
       FROM public.category ORDER BY display_order, name`,
  );
  return res.rows.map(mapCategory);
}

/** The id set reachable downward from `id` (inclusive) — for the no-cycle check (service). */
export async function categorySubtree(id: string): Promise<string[]> {
  const res = await query<{ id: string }>(
    `WITH RECURSIVE sub AS (
       SELECT id FROM public.category WHERE id = $1
       UNION ALL
       SELECT c.id FROM public.category c JOIN sub ON c.parent_id = sub.id
     ) SELECT id FROM sub`,
    [id],
  );
  return res.rows.map((r) => r.id);
}

export async function categoryExists(id: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM public.category WHERE id = $1) AS ok`,
    [id],
  );
  return res.rows[0]?.ok ?? false;
}

async function readCategory(id: string): Promise<Category | null> {
  const res = await query<CategoryRow>(
    `SELECT id, parent_id, key, name, display_order, status FROM public.category WHERE id = $1`,
    [id],
  );
  const row = res.rows[0];
  return row ? mapCategory(row) : null;
}

export async function createCategory(
  input: { key: string; name: string; parentId: string | null; displayOrder: number },
  actorSub: string,
): Promise<Category> {
  const id = await withTransaction(async (client) => {
    let newId: string;
    try {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO public.category (key, name, parent_id, display_order)
              VALUES ($1, $2, $3, $4) RETURNING id`,
        [input.key, input.name, input.parentId, input.displayOrder],
      );
      newId = ins.rows[0]!.id;
    } catch (err) {
      throw asConflict(err, "a category with this key already exists");
    }
    await insertAudit(client, actorSub, "category.create", "category", newId, { key: input.key });
    return newId;
  });
  return (await readCategory(id))!;
}

export async function updateCategory(
  id: string,
  values: { name: string; parentId: string | null; displayOrder: number },
  actorSub: string,
): Promise<Category> {
  await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `UPDATE public.category SET name = $2, parent_id = $3, display_order = $4, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [id, values.name, values.parentId, values.displayOrder],
    );
    if (!res.rows[0]) throw new CatalogError("not_found", "category not found");
    await insertAudit(client, actorSub, "category.update", "category", id, { name: values.name });
  });
  return (await readCategory(id))!;
}

export async function setCategoryStatus(
  id: string,
  status: SchemaStatus,
  actorSub: string,
): Promise<Category> {
  await withTransaction(async (client) => {
    const cur = await client.query<{ id: string }>(`SELECT id FROM public.category WHERE id = $1`, [id]);
    if (!cur.rows[0]) throw new CatalogError("not_found", "category not found");
    // Retiring a category still referenced by non-archived products is blocked (FR-006).
    if (status === "retired") {
      const used = await client.query<{ n: string }>(
        `SELECT count(*) AS n FROM public.product
          WHERE primary_category_id = $1 AND status <> 'archived'`,
        [id],
      );
      if (Number(used.rows[0]?.n ?? 0) > 0) {
        throw new CatalogError("conflict", "category has active products; cannot retire");
      }
    }
    await client.query(
      `UPDATE public.category SET status = $2, updated_at = now() WHERE id = $1`,
      [id, status],
    );
    await insertAudit(client, actorSub, "category.retire", "category", id, { status });
  });
  return (await readCategory(id))!;
}
