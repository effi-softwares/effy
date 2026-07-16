// Service layer for catalog schema authority (016) — validation + orchestration. No HTTP and no SQL
// (Principle VI). Dependencies wired by explicit module import (no DI framework); tests mock
// ./repository at the module boundary. Field validation is hand-written (no schema lib), mirroring
// the shops service.
import * as repo from "./repository";
import {
  ATTRIBUTE_DATA_TYPES,
  type AttributeDataType,
  type AttributeDefinition,
  type AttributeValidation,
  type Category,
  CatalogError,
  type FieldIssue,
  type ProductType,
  SCHEMA_STATUSES,
  type SchemaStatus,
} from "./types";

// ── Validation helpers ────────────────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z][a-z0-9_]*$/;

function requireText(value: unknown, field: string, fields: FieldIssue[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    fields.push({ field, message: "must be a non-empty string" });
  }
}

function requireSlug(value: unknown, field: string, fields: FieldIssue[]): void {
  if (typeof value !== "string" || !SLUG_RE.test(value.trim())) {
    fields.push({ field, message: "must be a lowercase slug (a-z, 0-9, _)" });
  }
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function optionalInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function parseStatus(value: unknown): SchemaStatus {
  if (typeof value !== "string" || !(SCHEMA_STATUSES as readonly string[]).includes(value)) {
    throw new CatalogError("validation", "invalid status", [
      { field: "status", message: `must be one of ${SCHEMA_STATUSES.join(", ")}` },
    ]);
  }
  return value as SchemaStatus;
}

function parseValidation(value: unknown, fields: FieldIssue[]): AttributeValidation | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") {
    fields.push({ field: "validation", message: "must be an object" });
    return null;
  }
  const v = value as Record<string, unknown>;
  const out: AttributeValidation = {};
  for (const k of ["min", "max", "maxLength"] as const) {
    if (v[k] !== undefined && v[k] !== null) {
      if (typeof v[k] !== "number" || !Number.isFinite(v[k])) {
        fields.push({ field: `validation.${k}`, message: "must be a number" });
      } else {
        out[k] = v[k] as number;
      }
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function parseAllowedValues(
  value: unknown,
  fields: FieldIssue[],
): { value: string; label: string; displayOrder: number }[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    fields.push({ field: "allowedValues", message: "must be an array" });
    return [];
  }
  const seen = new Set<string>();
  const out: { value: string; label: string; displayOrder: number }[] = [];
  value.forEach((raw, i) => {
    const v = raw as Record<string, unknown>;
    if (typeof v?.value !== "string" || v.value.trim().length === 0) {
      fields.push({ field: `allowedValues[${i}].value`, message: "must be a non-empty string" });
      return;
    }
    const val = v.value.trim();
    if (seen.has(val)) {
      fields.push({ field: `allowedValues[${i}].value`, message: "duplicate value" });
      return;
    }
    seen.add(val);
    out.push({
      value: val,
      label: typeof v.label === "string" && v.label.trim() ? v.label.trim() : val,
      displayOrder: optionalInt(v.displayOrder, i),
    });
  });
  return out;
}

// ── Product types ───────────────────────────────────────────────────────────────────────────────

export function listProductTypes(): Promise<ProductType[]> {
  return repo.listProductTypes();
}

export async function getProductType(id: string): Promise<ProductType> {
  const t = await repo.getProductType(id);
  if (!t) throw new CatalogError("not_found", "product type not found");
  return t;
}

export async function createProductType(
  input: { key?: unknown; name?: unknown; description?: unknown },
  actorSub: string,
): Promise<ProductType> {
  const fields: FieldIssue[] = [];
  requireSlug(input.key, "key", fields);
  requireText(input.name, "name", fields);
  if (fields.length > 0) throw new CatalogError("validation", "invalid product type", fields);
  return repo.createProductType(
    { key: (input.key as string).trim(), name: (input.name as string).trim(), description: optionalText(input.description) },
    actorSub,
  );
}

export async function updateProductType(
  id: string,
  patch: { name?: unknown; description?: unknown },
  actorSub: string,
): Promise<ProductType> {
  const current = await getProductType(id);
  let name = current.name;
  if ("name" in patch && patch.name !== undefined) {
    if (typeof patch.name !== "string" || patch.name.trim().length === 0) {
      throw new CatalogError("validation", "invalid product type", [
        { field: "name", message: "must be a non-empty string" },
      ]);
    }
    name = patch.name.trim();
  }
  const description = "description" in patch ? optionalText(patch.description) : current.description;
  return repo.updateProductType(id, { name, description }, actorSub);
}

export async function changeProductTypeStatus(
  id: string,
  status: unknown,
  actorSub: string,
): Promise<ProductType> {
  return repo.setProductTypeStatus(id, parseStatus(status), actorSub);
}

export async function assignAttribute(
  typeId: string,
  input: { attributeId?: unknown; isMandatory?: unknown; displayOrder?: unknown; groupLabel?: unknown },
  actorSub: string,
): Promise<ProductType> {
  const fields: FieldIssue[] = [];
  requireText(input.attributeId, "attributeId", fields);
  if (fields.length > 0) throw new CatalogError("validation", "invalid assignment", fields);
  return repo.assignAttribute(
    typeId,
    {
      attributeId: (input.attributeId as string).trim(),
      isMandatory: input.isMandatory === true,
      displayOrder: optionalInt(input.displayOrder, 0),
      groupLabel: optionalText(input.groupLabel),
    },
    actorSub,
  );
}

export function updateAssignment(
  typeId: string,
  attributeId: string,
  patch: { isMandatory?: unknown; displayOrder?: unknown; groupLabel?: unknown },
  actorSub: string,
): Promise<ProductType> {
  return repo.updateAssignment(
    typeId,
    attributeId,
    {
      isMandatory: patch.isMandatory === true,
      displayOrder: optionalInt(patch.displayOrder, 0),
      groupLabel: optionalText(patch.groupLabel),
    },
    actorSub,
  );
}

export function unassignAttribute(
  typeId: string,
  attributeId: string,
  actorSub: string,
): Promise<ProductType> {
  return repo.unassignAttribute(typeId, attributeId, actorSub);
}

// ── Attribute definitions ─────────────────────────────────────────────────────────────────────

export function listAttributes(): Promise<AttributeDefinition[]> {
  return repo.listAttributes();
}

export async function getAttribute(id: string): Promise<AttributeDefinition> {
  const a = await repo.getAttribute(id);
  if (!a) throw new CatalogError("not_found", "attribute not found");
  return a;
}

export async function createAttribute(
  input: {
    key?: unknown;
    name?: unknown;
    dataType?: unknown;
    unit?: unknown;
    helpText?: unknown;
    validation?: unknown;
    allowedValues?: unknown;
  },
  actorSub: string,
): Promise<AttributeDefinition> {
  const fields: FieldIssue[] = [];
  requireSlug(input.key, "key", fields);
  requireText(input.name, "name", fields);
  if (typeof input.dataType !== "string" || !(ATTRIBUTE_DATA_TYPES as readonly string[]).includes(input.dataType)) {
    fields.push({ field: "dataType", message: `must be one of ${ATTRIBUTE_DATA_TYPES.join(", ")}` });
  }
  const validation = parseValidation(input.validation, fields);
  const allowedValues = parseAllowedValues(input.allowedValues, fields);
  const dataType = input.dataType as AttributeDataType;
  const isSelect = dataType === "single_select" || dataType === "multi_select";
  if (isSelect && allowedValues.length === 0) {
    fields.push({ field: "allowedValues", message: "select attributes need at least one allowed value" });
  }
  if (fields.length > 0) throw new CatalogError("validation", "invalid attribute", fields);
  return repo.createAttribute(
    {
      key: (input.key as string).trim(),
      name: (input.name as string).trim(),
      dataType,
      unit: optionalText(input.unit),
      helpText: optionalText(input.helpText),
      validation,
      allowedValues,
    },
    actorSub,
  );
}

export async function updateAttribute(
  id: string,
  patch: { name?: unknown; unit?: unknown; helpText?: unknown; validation?: unknown; allowedValues?: unknown },
  actorSub: string,
): Promise<AttributeDefinition> {
  const current = await getAttribute(id);
  const fields: FieldIssue[] = [];
  let name = current.name;
  if ("name" in patch && patch.name !== undefined) {
    requireText(patch.name, "name", fields);
    if (typeof patch.name === "string" && patch.name.trim()) name = patch.name.trim();
  }
  const validation = "validation" in patch ? parseValidation(patch.validation, fields) : current.validation;
  const allowedValues = "allowedValues" in patch ? parseAllowedValues(patch.allowedValues, fields) : null;
  if (fields.length > 0) throw new CatalogError("validation", "invalid attribute", fields);
  return repo.updateAttribute(
    id,
    {
      name,
      unit: "unit" in patch ? optionalText(patch.unit) : current.unit,
      helpText: "helpText" in patch ? optionalText(patch.helpText) : current.helpText,
      validation,
      allowedValues,
    },
    actorSub,
  );
}

export async function changeAttributeStatus(
  id: string,
  status: unknown,
  actorSub: string,
): Promise<AttributeDefinition> {
  return repo.setAttributeStatus(id, parseStatus(status), actorSub);
}

export function deleteAllowedValue(
  attributeId: string,
  valueId: string,
  actorSub: string,
): Promise<AttributeDefinition> {
  return repo.deleteAllowedValue(attributeId, valueId, actorSub);
}

// ── Categories ──────────────────────────────────────────────────────────────────────────────────

export function listCategories(): Promise<Category[]> {
  return repo.listCategories();
}

async function validateParent(id: string | null, parentId: string | null): Promise<void> {
  if (!parentId) return;
  if (id && parentId === id) {
    throw new CatalogError("validation", "a category cannot be its own parent", [
      { field: "parentId", message: "cannot be self" },
    ]);
  }
  if (!(await repo.categoryExists(parentId))) {
    throw new CatalogError("validation", "parent category not found", [
      { field: "parentId", message: "must reference an existing category" },
    ]);
  }
  // No cycles: the new parent must not sit within this category's own subtree (FR / R4).
  if (id) {
    const subtree = await repo.categorySubtree(id);
    if (subtree.includes(parentId)) {
      throw new CatalogError("validation", "moving a category under its own descendant creates a cycle", [
        { field: "parentId", message: "would create a cycle" },
      ]);
    }
  }
}

export async function createCategory(
  input: { key?: unknown; name?: unknown; parentId?: unknown; displayOrder?: unknown },
  actorSub: string,
): Promise<Category> {
  const fields: FieldIssue[] = [];
  requireSlug(input.key, "key", fields);
  requireText(input.name, "name", fields);
  if (fields.length > 0) throw new CatalogError("validation", "invalid category", fields);
  const parentId = optionalText(input.parentId);
  await validateParent(null, parentId);
  return repo.createCategory(
    { key: (input.key as string).trim(), name: (input.name as string).trim(), parentId, displayOrder: optionalInt(input.displayOrder, 0) },
    actorSub,
  );
}

export async function updateCategory(
  id: string,
  patch: { name?: unknown; parentId?: unknown; displayOrder?: unknown },
  actorSub: string,
): Promise<Category> {
  const current = (await repo.listCategories()).find((c) => c.id === id);
  if (!current) throw new CatalogError("not_found", "category not found");
  let name = current.name;
  if ("name" in patch && patch.name !== undefined) {
    if (typeof patch.name !== "string" || patch.name.trim().length === 0) {
      throw new CatalogError("validation", "invalid category", [
        { field: "name", message: "must be a non-empty string" },
      ]);
    }
    name = patch.name.trim();
  }
  const parentId = "parentId" in patch ? optionalText(patch.parentId) : current.parentId;
  await validateParent(id, parentId);
  const displayOrder = "displayOrder" in patch ? optionalInt(patch.displayOrder, current.displayOrder) : current.displayOrder;
  return repo.updateCategory(id, { name, parentId, displayOrder }, actorSub);
}

export function changeCategoryStatus(id: string, status: unknown, actorSub: string): Promise<Category> {
  return repo.setCategoryStatus(id, parseStatus(status), actorSub);
}
