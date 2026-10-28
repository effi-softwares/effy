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
        ? "that email belongs to someone who was stood down here — re-activate them instead of inviting again"
        : "that email is already on your team",
    );
  }

  // A new member only: the address is not on the team (checked above). Refused before any sign-in is made.
  if (await repo.isFull(shopId)) throw new ProductError("conflict", SET_FULL_SENTENCE);
  const sub = await cognito.ensureShopUser(email, name, role);
  await repo.upsertMember(shopId, sub, email, name, role);
}

export async function changeRole(
  shopId: string,
  callerSub: string,
  staffId: string,
  body: Record<string, unknown>,
): Promise<void> {
  await requireManager(shopId, callerSub);
  const role = parseRole(body.role);

  // Demoting the last manager locks the shop out too.
  if (role !== "shop_manager" && (await repo.activeManagersExcluding(shopId, staffId)) === 0) {
    throw new ProductError("conflict", "this shop would be left with no manager");
  }

  const email = await repo.setRole(shopId, staffId, role);
  // The shop service reconciles from the groups claim, so a role change must touch Cognito too.
  if (email) await cognito.setUserGroups(email, [role]);
}

export async function deactivate(
  shopId: string,
  callerSub: string,
  staffId: string,
): Promise<void> {
  await requireManager(shopId, callerSub);

  if ((await repo.activeManagersExcluding(shopId, staffId)) === 0) {
    throw new ProductError("conflict", "this shop would be left with no manager");
  }

  const email = await repo.deactivate(shopId, staffId);
  // Defence in depth: no session can be obtained at all.
  if (email) await cognito.disableUser(email);
}
