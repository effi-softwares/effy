// The taxonomy's back-office operations (101). Each write is one transaction through the one writer
// (@effy/edge-shared/catalog/taxonomy.ts), with its audit row; after commit back-office and every shop are
// told (`announceTaxonomy`). Reads are the repository's.
import { emitMetric, metricNamespace, query, withTransaction, type Queryable } from "@effy/edge-shared";
import {
  createAttribute, createCategory, deleteAttachment, moveCategory, putAttachment, readForm, setAttributeStatus,
  setCategoryStatus, TaxonomyRefusal, updateAttribute, updateCategory,
} from "@effy/edge-shared/catalog";
import { announceTaxonomy } from "@effy/edge-shared/live";
import type {
  AttachmentInput, AttributeDTO, AttributeInput, CategoryFormDTO, TaxonomyCategoryDTO, TaxonomyStatus, TaxonomyTreeDTO,
} from "@effy/shared-types";

import { categoryImageUpload } from "./images";
import * as repo from "./repository";

type Kind = "category" | "attribute" | "attachment";

/** One write: the writer, its audit row, then (after commit) the announcement and the metrics. */
async function write<T>(kind: Kind, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const started = Date.now();
  const out = await withTransaction(fn);
  emitMetric(metricNamespace(), "TaxonomyChanged", 1, { kind });
  emitMetric(metricNamespace(), "TaxonomyRebuildMs", Date.now() - started);
  await announceTaxonomy();
  return out;
}

const notFound = (what: string) => new TaxonomyRefusal("not_found", "not_found", `${what} not found`);
const statusOf = (v: unknown): TaxonomyStatus => {
  if (v !== "active" && v !== "retired") throw new TaxonomyRefusal("validation", "invalid_status", "must be active or retired", [{ field: "status", message: "must be active or retired" }]);
  return v;
};

export async function tree(): Promise<TaxonomyTreeDTO> {
  return { categories: await repo.readTree() };
}

async function categoryOut(id: string): Promise<TaxonomyCategoryDTO> {
  const c = await repo.readCategory(id);
  if (!c) throw notFound("category");
  return c;
}

export async function create(body: Record<string, unknown>, actor: string): Promise<TaxonomyCategoryDTO> {
  const parentId = body.parentId === null || body.parentId === undefined ? null : String(body.parentId);
  const id = await write("category", async (tx) => {
    const created = await createCategory(tx, {
      parentId, name: body.name, icon: body.icon, synonyms: body.synonyms, defaults: body.defaults,
      moveProductsToSelf: body.moveProductsToSelf === true,
    });
    await repo.audit(tx, actor, "taxonomy.category_created", "category", created, { parentId, name: body.name, movedProducts: body.moveProductsToSelf === true });
    return created;
  });
  return categoryOut(id);
}

export async function update(id: string, body: Record<string, unknown>, actor: string): Promise<TaxonomyCategoryDTO> {
  await write("category", async (tx) => {
    await updateCategory(tx, id, { name: body.name, icon: body.icon, imageKey: body.imageKey, synonyms: body.synonyms, defaults: body.defaults });
    await repo.audit(tx, actor, "taxonomy.category_updated", "category", id, { changed: Object.keys(body).sort() });
  });
  return categoryOut(id);
}

export async function move(id: string, body: Record<string, unknown>, actor: string): Promise<TaxonomyTreeDTO> {
  const parentId = body.parentId === null || body.parentId === undefined ? null : String(body.parentId);
  const position = typeof body.position === "number" ? body.position : Number.NaN;
  await write("category", async (tx) => {
    await moveCategory(tx, id, parentId, position);
    await repo.audit(tx, actor, "taxonomy.category_moved", "category", id, { parentId, position });
  });
  return tree();
}

export async function setStatus(id: string, body: Record<string, unknown>, actor: string): Promise<TaxonomyCategoryDTO> {
  const status = statusOf(body.status);
  await write("category", async (tx) => {
    await setCategoryStatus(tx, id, status, body.moveProductsToSelf === true);
    await repo.audit(tx, actor, status === "retired" ? "taxonomy.category_retired" : "taxonomy.category_restored", "category", id, {});
  });
  return categoryOut(id);
}

export async function imageUpload(id: string, body: Record<string, unknown>): Promise<{ uploadUrl: string; imageKey: string }> {
  if (!(await repo.readCategory(id))) throw notFound("category");
  return categoryImageUpload(id, body.contentType, body.fileSize);
}

/** The resolved form with where each row came from, and the category's own attachments. */
export async function form(id: string): Promise<CategoryFormDTO> {
  const db: Queryable = { query };
  const f = await readForm(db, id, { withSources: true });
  if (!f) throw notFound("category");
  return { ...f, own: await repo.readOwnAttachments(id, db) };
}

export async function attach(categoryId: string, attributeId: string, body: AttachmentInput, actor: string): Promise<CategoryFormDTO> {
  await write("attachment", async (tx) => {
    await putAttachment(tx, categoryId, attributeId, body);
    await repo.audit(tx, actor, "taxonomy.attachment_set", "category_attribute", categoryId, { attributeId, ...body });
  });
  return form(categoryId);
}

export async function detach(categoryId: string, attributeId: string, actor: string): Promise<CategoryFormDTO> {
  await write("attachment", async (tx) => {
    await deleteAttachment(tx, categoryId, attributeId);
    await repo.audit(tx, actor, "taxonomy.attachment_removed", "category_attribute", categoryId, { attributeId });
  });
  return form(categoryId);
}

export async function attributes(params: Record<string, string | undefined>): Promise<AttributeDTO[]> {
  const status = params.status === "active" || params.status === "retired" ? params.status : null;
  return repo.readAttributes({ status, q: params.q?.trim() ? params.q.trim() : null });
}

export async function attribute(id: string): Promise<AttributeDTO> {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const a = UUID.test(id) ? await repo.readAttribute(id) : null;
  if (!a) throw notFound("attribute");
  return a;
}

export async function createAttr(body: Partial<AttributeInput>, actor: string): Promise<AttributeDTO> {
  const id = await write("attribute", async (tx) => {
    const created = await createAttribute(tx, body);
    await repo.audit(tx, actor, "taxonomy.attribute_created", "attribute_definition", created, { name: body.name, inputType: body.inputType });
    return created;
  });
  return attribute(id);
}

export async function updateAttr(id: string, body: Partial<AttributeInput>, actor: string): Promise<AttributeDTO> {
  await write("attribute", async (tx) => {
    await updateAttribute(tx, id, body);
    await repo.audit(tx, actor, "taxonomy.attribute_updated", "attribute_definition", id, { changed: Object.keys(body).sort() });
  });
  return attribute(id);
}

export async function setAttrStatus(id: string, body: Record<string, unknown>, actor: string): Promise<AttributeDTO> {
  const status = statusOf(body.status);
  await write("attribute", async (tx) => {
    await setAttributeStatus(tx, id, status);
    await repo.audit(tx, actor, status === "retired" ? "taxonomy.attribute_retired" : "taxonomy.attribute_restored", "attribute_definition", id, {});
  });
  return attribute(id);
}
