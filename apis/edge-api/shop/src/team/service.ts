import { SET_FULL_SENTENCE } from "@effy/edge-shared";
import { SHOP_ROLES, type ShopRole, type ShopTeamMemberDTO } from "@effy/shared-types";

import { ProductError } from "../products/types";
import * as cognito from "./cognito";
import * as repo from "./repository";

/** Manager-only, from the platform record: a manager stood down minutes ago still holds a valid token. */
export async function requireManager(shopId: string, sub: string): Promise<void> {
  const team = await repo.listTeam(shopId, sub);
  const me = team.find((m) => m.isSelf);
  if (!me || me.status !== "active" || !me.roles.includes("shop_manager")) {
    // Uniform: never says which term failed.
    throw new ProductError("forbidden", "shop manager access is required");
  }
}

export function listTeam(shopId: string, sub: string): Promise<ShopTeamMemberDTO[]> {
  return repo.listTeam(shopId, sub);
}

function parseRole(value: unknown): ShopRole {
  if (typeof value !== "string" || !SHOP_ROLES.includes(value as ShopRole)) {
    throw new ProductError("validation", "invalid role", [
      { field: "role", message: `must be one of ${SHOP_ROLES.join(", ")}` },
    ]);
  }
  return value as ShopRole;
}

function parseEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  // Permissive: Cognito owns deliverability; this only refuses what is obviously not an address.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ProductError("validation", "invalid email", [
      { field: "email", message: "must be a work email address" },
    ]);
  }
  return email;
}

/**
 * An address already known to this shop is refused, naming the situation (re-activate them, or use
 * another address), never adopted: provisioning would revive a departed colleague's sign-in.
 */
export async function invite(
  shopId: string,
  callerSub: string,
  body: Record<string, unknown>,
): Promise<void> {
  await requireManager(shopId, callerSub);

  const email = parseEmail(body.email);
  const role = parseRole(body.role);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    throw new ProductError("validation", "invalid invite", [
      { field: "name", message: "is required" },
    ]);
  }

  const existing = await repo.findByEmail(shopId, email);
  if (existing) {
    if (!existing.sameShop) {
      // Never "they work at another shop": that discloses staffing elsewhere.
      throw new ProductError("conflict", "that email is already in use on the platform");
    }
    throw new ProductError(
      "conflict",
      existing.status === "disabled"
        ? "that email belongs to someone who was stood down here — reinstate them from the team list instead of inviting again"
        : "that email is already on your team",
    );
  }

  // A new member only: the address is not on the team (checked above). Refused before any sign-in is made.
  if (await repo.isFull(shopId)) throw new ProductError("conflict", SET_FULL_SENTENCE);
  const sub = await cognito.ensureShopUser(email, name, role);
  await repo.upsertMember(shopId, sub, email, name, role);
}

const NAME_MAX = 120;

function parseName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > NAME_MAX) {
    throw new ProductError("validation", "invalid name", [
      { field: "name", message: `is required, at most ${NAME_MAX} characters` },
    ]);
  }
  return name;
}

function parseStatus(value: unknown): "active" | "disabled" {
  if (value !== "active" && value !== "disabled") {
    throw new ProductError("validation", "invalid status", [
      { field: "status", message: "must be active or disabled" },
    ]);
  }
  return value;
}

/**
 * A manager edits a colleague: their name, their role, and whether they may sign in (stand down /
 * reinstate). The email is the sign-in address and is never changed here — a new address is a new
 * invitation. Every field is optional; at least one is required.
 */
export async function updateMember(
  shopId: string,
  callerSub: string,
  staffId: string,
  body: Record<string, unknown>,
): Promise<void> {
  await requireManager(shopId, callerSub);

  const patch: repo.MemberPatch = {};
  if (body.name !== undefined) patch.name = parseName(body.name);
  if (body.role !== undefined) patch.role = parseRole(body.role);
  if (body.status !== undefined) patch.status = parseStatus(body.status);
  if (patch.name === undefined && patch.role === undefined && patch.status === undefined) {
    throw new ProductError("validation", "nothing to update", [
      { field: "body", message: "provide name, role and/or status" },
    ]);
  }

  // Refusals (self stand-down, last manager) are decided under the team's row locks.
  const result = await repo.updateMember(shopId, staffId, callerSub, patch);
  if (!result.email) return;

  // The shop service reconciles from the groups claim, so a role change must touch Cognito too.
  if (result.roleChanged && patch.role) await cognito.setUserGroups(result.email, [patch.role]);
  if (result.statusChanged) {
    // Defence in depth: a stood-down colleague cannot obtain a session at all.
    if (patch.status === "disabled") await cognito.disableUser(result.email);
    else await cognito.enableUser(result.email);
  }
}
