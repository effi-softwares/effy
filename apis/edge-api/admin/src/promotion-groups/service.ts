// Display groups (094 US2): validation and rules. Every change is announced to back-office.
import { announce } from "@effy/edge-shared/live";
import type { AdminPromotionGroupDetailDTO, AdminPromotionGroupDTO, AdminPromotionGroupPreviewDTO } from "@effy/shared-types";

import { PromoError } from "../promotions/types";
import * as repo from "./repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const changed = () => announce([{ scope: "ops", kind: "promotions" }]);

const notFound = () => new PromoError(404, "not_found", "group not found");
const invalid = (field: string, message: string) => new PromoError(422, "validation_failed", `${field}: ${message}`, [{ field, message }]);

export const listGroups = (): Promise<AdminPromotionGroupDTO[]> => repo.listGroups();

export async function readGroup(id: string): Promise<AdminPromotionGroupDetailDTO> {
  if (!UUID.test(id)) throw notFound();
  return (await repo.readGroup(id, new Date())) ?? Promise.reject(notFound());
}

export async function createGroup(body: Record<string, unknown>, actor: string): Promise<AdminPromotionGroupDTO> {
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!KEY.test(key) || key.length > 40) throw invalid("key", "lower-case letters, numbers and dashes, up to 40");
  if (!name || name.length > 80) throw invalid("name", "1–80 characters");
  const description = typeof body.description === "string" && body.description.trim() ? body.description.trim().slice(0, 240) : null;
  const g = await repo.createGroup({ key, name, description }, actor);
  await changed();
  return g;
}

export async function updateGroup(id: string, body: Record<string, unknown>, actor: string): Promise<AdminPromotionGroupDTO> {
  if (!UUID.test(id)) throw notFound();
  if ("key" in body) throw new PromoError(409, "group_key_fixed", "A group's key can't change — the website and app ask for it by key.");
  const input: { name?: string; description?: string | null; sort?: number } = {};
  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 80) throw invalid("name", "1–80 characters");
    input.name = name;
  }
  if ("description" in body) input.description = typeof body.description === "string" && body.description.trim() ? body.description.trim().slice(0, 240) : null;
  if ("sort" in body) {
    if (!Number.isInteger(body.sort)) throw invalid("sort", "a whole number");
    input.sort = body.sort as number;
  }
  await repo.updateGroup(id, input, actor);
  await changed();
  return readGroup(id);
}

export async function deleteGroup(id: string, actor: string): Promise<void> {
  if (!UUID.test(id)) throw notFound();
  await repo.deleteGroup(id, actor);
  await changed();
}

export async function putMembers(id: string, body: Record<string, unknown>, actor: string): Promise<AdminPromotionGroupDetailDTO> {
  if (!UUID.test(id)) throw notFound();
  const ids = Array.isArray(body.promotionIds) ? body.promotionIds : null;
  if (!ids || !ids.every((x) => typeof x === "string" && UUID.test(x)) || new Set(ids).size !== ids.length || ids.length > 100) {
    throw invalid("promotionIds", "a list of distinct promotions, in display order");
  }
  await repo.putMembers(id, ids as string[], actor);
  await changed();
  return readGroup(id);
}

export async function previewGroup(id: string): Promise<AdminPromotionGroupPreviewDTO> {
  if (!UUID.test(id)) throw notFound();
  return repo.previewGroup(id, new Date());
}
