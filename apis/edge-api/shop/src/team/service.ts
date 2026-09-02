// Service for shop team management (057, US7): validation, authorization and orchestration.
import { SHOP_ROLES, type ShopRole, type ShopTeamMemberDTO } from "@effy/shared-types";

import { ProductError } from "../products/types";
import * as cognito from "./cognito";
import * as repo from "./repository";

/**
 * ⚠ MANAGER-ONLY, AND CHECKED FROM THE PLATFORM RECORD. The `cognito:groups` claim is the ORIGIN of a
 * role assignment; where the platform keeps its own record, the record decides (Principle IV). A
 * manager stood down five minutes ago still holds a valid token.
 */
export async function requireManager(shopId: string, sub: string): Promise<void> {
  const team = await repo.listTeam(shopId, sub);
  const me = team.find((m) => m.isSelf);
  if (!me || me.status !== "active" || !me.roles.includes("shop_manager")) {
    // Uniform: it never says which term failed.
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
  // Deliberately permissive — Cognito is the authority on deliverability. This only rejects what is
  // obviously not an address, so a typo fails here rather than creating a real account nobody reads.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ProductError("validation", "invalid email", [
      { field: "email", message: "must be a work email address" },
    ]);
  }
  return email;
}

/**
 * Invite a colleague (US7, FR-019).
 *
 * ⚠ IT REFUSES A REUSED EMAIL RATHER THAN ADOPTING THE RECORD BEHIND IT. This is the one place 057
 * deliberately does NOT reuse 009's provisioning as-is, and this feature's own research (R5) got it
 * wrong: `ensureShopUser` recovers an existing account and RE-ENABLES it if disabled, which 009
 * documented as break-glass parity for a back-office admin. For a shop manager it is a trap — 056
 * records exactly this defect on the driver path: "reusing a departed employee's work email adopted
 * their record, overwrote name and vehicle, brought their sign-in back to life — and reported
 * success." A manager typing a former colleague's address has no way to know any of that happened.
 *
 * So: an address already known to this shop is refused, and the refusal NAMES the situation so the
 * manager can act on it (re-activate them deliberately, or use a different address).
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
      // ⚠ It does NOT say "they work at another shop" — that would disclose staffing at a shop this
      // manager has no business knowing about. It says what they can do about it.
      throw new ProductError("conflict", "that email is already in use on the platform");
    }
    throw new ProductError(
      "conflict",
      existing.status === "disabled"
        ? "that email belongs to someone who was stood down here — re-activate them instead of inviting again"
        : "that email is already on your team",
    );
  }

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

  // ⚠ Demoting the last manager locks the shop out exactly as deactivating them would.
  if (role !== "shop_manager" && (await repo.activeManagersExcluding(shopId, staffId)) === 0) {
    throw new ProductError("conflict", "this shop would be left with no manager");
  }

  const email = await repo.setRole(shopId, staffId, role);
  // The claim is the origin the shop service reconciles from, so a role change MUST touch Cognito
  // too — otherwise the next sign-in reinstates the old group (009 research R5).
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
  // Defense in depth: the platform record already refuses them, and disabling the identity means they
  // cannot obtain a session at all.
  if (email) await cognito.disableUser(email);
}
