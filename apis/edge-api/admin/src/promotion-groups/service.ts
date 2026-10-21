// Display groups (094 US2): validation and rules. Every change is announced to back-office.
import { announce } from "@effy/edge-shared/live";
import { GROUP_SIZES, type AdminPromotionGroupDetailDTO, type AdminPromotionGroupDTO, type AdminPromotionGroupPreviewDTO, type AdminUpdatePromotionGroupResponse, type GroupSize } from "@effy/shared-types";

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
  const size = body.size === undefined ? "medium" : body.size;
  if (!(GROUP_SIZES as readonly unknown[]).includes(size)) throw invalid("size", "large, medium, small or strip");
  const g = await repo.createGroup({ key, name, description, size: size as GroupSize }, actor);
  await changed();
  return g;
}

export async function updateGroup(id: string, body: Record<string, unknown>, actor: string): Promise<AdminUpdatePromotionGroupResponse> {
  if (!UUID.test(id)) throw notFound();
  if ("key" in body) throw new PromoError(409, "group_key_fixed", "A group's key can't change — the website and app ask for it by key.");
  const input: repo.GroupChange = {};
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
  // 095 — the size of the place and the skins its members wear by default.
  if ("size" in body) {
    if (!(GROUP_SIZES as readonly unknown[]).includes(body.size)) throw invalid("size", "large, medium, small or strip");
    input.size = body.size as GroupSize;
  }
  if ("defaultSkinId" in body) {
    if (typeof body.defaultSkinId !== "string" || !UUID.test(body.defaultSkinId)) throw invalid("defaultSkinId", "a skin");
    input.defaultSkinId = body.defaultSkinId;
  }
  if ("defaultCodeSkinId" in body) {
    if (body.defaultCodeSkinId !== null && (typeof body.defaultCodeSkinId !== "string" || !UUID.test(body.defaultCodeSkinId))) throw invalid("defaultCodeSkinId", "a skin, or none");
    input.defaultCodeSkinId = body.defaultCodeSkinId as string | null;
  }
  const { reset } = await repo.updateGroup(id, input, actor);
  await changed();
  return { ...(await readGroup(id)), reset };
}

export async function deleteGroup(id: string, actor: string): Promise<void> {
  if (!UUID.test(id)) throw notFound();
  await repo.deleteGroup(id, actor);
  await changed();
}

const optionalId = (v: unknown) => v === undefined || v === null || (typeof v === "string" && UUID.test(v));

/** The members, in order: 095's `members` (with each one's skin and picture) or 094's `promotionIds`. */
function membersOf(body: Record<string, unknown>): repo.MemberInput[] {
  if (Array.isArray(body.members)) {
    const list = body.members as unknown[];
    const ok = list.every((m) => {
      const o = m as Record<string, unknown> | null;
      return o !== null && typeof o === "object" && typeof o.promotionId === "string" && UUID.test(o.promotionId) && optionalId(o.skinId) && optionalId(o.imageId);
    });
    if (!ok || list.length > 100) throw invalid("members", "a list of promotions, each with an optional skin and picture, in display order");
    const members = (list as Record<string, unknown>[]).map((m) => ({
      promotionId: m.promotionId as string,
      skinId: (m.skinId as string | null | undefined) ?? null,
      imageId: (m.imageId as string | null | undefined) ?? null,
    }));
    if (new Set(members.map((m) => m.promotionId)).size !== members.length) throw invalid("members", "each promotion once");
    return members;
  }
  const ids = Array.isArray(body.promotionIds) ? body.promotionIds : null;
  if (!ids || !ids.every((x) => typeof x === "string" && UUID.test(x)) || new Set(ids).size !== ids.length || ids.length > 100) {
    throw invalid("promotionIds", "a list of distinct promotions, in display order");
  }
  // 094's shape says nothing about skins: each promotion keeps the choices it had here.
  return (ids as string[]).map((promotionId) => ({ promotionId, skinId: undefined, imageId: undefined }));
}

export async function putMembers(id: string, body: Record<string, unknown>, actor: string): Promise<AdminPromotionGroupDetailDTO> {
  if (!UUID.test(id)) throw notFound();
  await repo.putMembers(id, membersOf(body), actor);
  await changed();
  return readGroup(id);
}

export async function previewGroup(id: string): Promise<AdminPromotionGroupPreviewDTO> {
  if (!UUID.test(id)) throw notFound();
  return repo.previewGroup(id, new Date());
}
