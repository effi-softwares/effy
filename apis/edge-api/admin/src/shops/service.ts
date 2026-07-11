// Service layer for shop management — validation, the Cognito-first provisioning orchestration
// (research R4), lifecycle-transition rules, and the identity↔record consistency rules (R5). No
// HTTP and no SQL (Principle VI). Dependencies are wired by explicit module imports (no DI
// framework); tests mock ./cognito and ./repository at the module boundary.
import * as cognito from "./cognito";
import * as repo from "./repository";
import {
  type AuditEntry,
  type Paged,
  type ShopDetail,
  ShopError,
  type ShopLifecycleStatus,
  type ShopListItem,
  type ShopRole,
  type ShopStaffStatus,
  type ShopUser,
  SHOP_LIFECYCLE_STATUSES,
  SHOP_ROLES,
} from "./types";

function looksLikeEmail(v: unknown): v is string {
  return typeof v === "string" && /.+@.+/.test(v.trim());
}

function requireText(value: unknown, field: string, fields: { field: string; message: string }[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    fields.push({ field, message: "must be a non-empty string" });
  }
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

// ── Reads ──────────────────────────────────────────────────────────────────────────────────

export async function listShops(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  q?: string;
}): Promise<Paged<ShopListItem>> {
  const page = params.page && params.page > 0 ? Math.floor(params.page) : 1;
  const pageSize = params.pageSize && params.pageSize > 0 ? Math.min(Math.floor(params.pageSize), 100) : 20;
  const status =
    params.status && (SHOP_LIFECYCLE_STATUSES as readonly string[]).includes(params.status)
      ? (params.status as ShopLifecycleStatus)
      : null;
  const q = params.q && params.q.trim().length > 0 ? params.q.trim() : null;
  return repo.listShops({ page, pageSize, status, q });
}

export async function getShop(shopId: string): Promise<ShopDetail> {
  const detail = await repo.getShopDetail(shopId);
  if (!detail) throw new ShopError("not_found", "shop not found");
  return detail;
}

export async function getShopHistory(
  shopId: string,
  page?: number,
  pageSize?: number,
): Promise<Paged<AuditEntry>> {
  const p = page && page > 0 ? Math.floor(page) : 1;
  const ps = pageSize && pageSize > 0 ? Math.min(Math.floor(pageSize), 100) : 50;
  return repo.listShopHistory(shopId, p, ps);
}

// ── Create shop + primary manager (Cognito-first, then DB — R4) ────────────────────────────────

export async function createShop(
  input: {
    code?: unknown;
    name?: unknown;
    contactPhone?: unknown;
    notes?: unknown;
    primaryContact?: { name?: unknown; email?: unknown };
  },
  actorSub: string,
): Promise<ShopDetail> {
  const fields: { field: string; message: string }[] = [];
  requireText(input.code, "code", fields);
  requireText(input.name, "name", fields);
  requireText(input.primaryContact?.name, "primaryContact.name", fields);
  if (!looksLikeEmail(input.primaryContact?.email)) {
    fields.push({ field: "primaryContact.email", message: "must be a valid email" });
  }
  if (fields.length > 0) throw new ShopError("validation", "invalid shop", fields);

  const code = (input.code as string).trim();
  const name = (input.name as string).trim();
  const contactName = (input.primaryContact!.name as string).trim();
  const email = (input.primaryContact!.email as string).trim();

  if (await repo.shopExistsByCode(code)) {
    throw new ShopError("conflict", "a shop with this code already exists");
  }
  if (await repo.shopIdForEmail(email)) {
    throw new ShopError("conflict", "this email already belongs to a shop user");
  }

  // Cognito-first: the returned sub is the DB join key (R4). Idempotent on retry.
  const sub = await cognito.ensureShopUser(email, contactName, "shop_manager");

  return repo.createShopWithManager(
    {
      code,
      name,
      contactPhone: optionalText(input.contactPhone),
      notes: optionalText(input.notes),
      primary: { sub, email, name: contactName },
    },
    actorSub,
  );
}

// ── Edit details ───────────────────────────────────────────────────────────────────────────

export async function editShop(
  shopId: string,
  patch: { name?: unknown; contactPhone?: unknown; notes?: unknown },
  actorSub: string,
): Promise<ShopDetail> {
  const current = await repo.getShopDetail(shopId);
  if (!current) throw new ShopError("not_found", "shop not found");

  let name = current.name;
  if ("name" in patch && patch.name !== undefined) {
    if (typeof patch.name !== "string" || patch.name.trim().length === 0) {
      throw new ShopError("validation", "invalid shop", [
        { field: "name", message: "must be a non-empty string" },
      ]);
    }
    name = patch.name.trim();
  }
  const contactPhone = "contactPhone" in patch ? optionalText(patch.contactPhone) : current.contactPhone;
  const notes = "notes" in patch ? optionalText(patch.notes) : current.notes;

  return repo.updateShop(shopId, { name, contactPhone, notes }, actorSub);
}

// ── Lifecycle ────────────────────────────────────────────────────────────────────────────────

export async function changeShopStatus(
  shopId: string,
  to: unknown,
  actorSub: string,
): Promise<ShopDetail> {
  if (typeof to !== "string" || !(SHOP_LIFECYCLE_STATUSES as readonly string[]).includes(to)) {
    throw new ShopError("validation", "invalid status", [
      { field: "status", message: `must be one of ${SHOP_LIFECYCLE_STATUSES.join(", ")}` },
    ]);
  }
  const from = await repo.shopStatus(shopId);
  if (!from) throw new ShopError("not_found", "shop not found");
  if (from === to) throw new ShopError("conflict", `shop is already ${to}`);
  return repo.changeShopStatus(shopId, from, to as ShopLifecycleStatus, actorSub);
}

export async function removeShop(shopId: string, actorSub: string): Promise<void> {
  await repo.deleteShop(shopId, actorSub);
}

// ── Roster ─────────────────────────────────────────────────────────────────────────────────

export async function addShopUser(
  shopId: string,
  input: { name?: unknown; email?: unknown; role?: unknown },
  actorSub: string,
): Promise<ShopUser> {
  const fields: { field: string; message: string }[] = [];
  requireText(input.name, "name", fields);
  if (!looksLikeEmail(input.email)) fields.push({ field: "email", message: "must be a valid email" });
  const role = input.role;
  if (typeof role !== "string" || !(SHOP_ROLES as readonly string[]).includes(role)) {
    fields.push({ field: "role", message: `must be one of ${SHOP_ROLES.join(", ")}` });
  }
  if (fields.length > 0) throw new ShopError("validation", "invalid shop user", fields);

  const name = (input.name as string).trim();
  const email = (input.email as string).trim();

  const boundShop = await repo.shopIdForEmail(email);
  if (boundShop) throw new ShopError("conflict", "this email already belongs to a shop user");

  const sub = await cognito.ensureShopUser(email, name, role as ShopRole);
  return repo.addShopUser(shopId, { sub, email, name, role: role as ShopRole }, actorSub);
}

export async function updateShopUser(
  shopId: string,
  userId: string,
  patch: { role?: unknown; status?: unknown },
  actorSub: string,
): Promise<ShopUser> {
  const target = await repo.getShopUserForUpdate(shopId, userId);

  const hasRole = "role" in patch && patch.role !== undefined;
  const hasStatus = "status" in patch && patch.status !== undefined;
  if (!hasRole && !hasStatus) {
    throw new ShopError("validation", "nothing to update", [
      { field: "body", message: "provide role and/or status" },
    ]);
  }

  let result: ShopUser | undefined;

  if (hasRole) {
    const role = patch.role;
    if (typeof role !== "string" || !(SHOP_ROLES as readonly string[]).includes(role)) {
      throw new ShopError("validation", "invalid role", [
        { field: "role", message: `must be one of ${SHOP_ROLES.join(", ")}` },
      ]);
    }
    if (!target.email) throw new ShopError("validation", "user has no email on record", []);
    // Touch Cognito (the ORIGIN the shop service reconciles from) AND the DB record (R5).
    await cognito.setUserGroups(target.email, [role as ShopRole]);
    result = await repo.setShopUserRole(userId, role as ShopRole, actorSub);
  }

  if (hasStatus) {
    const status = patch.status;
    if (status !== "active" && status !== "disabled") {
      throw new ShopError("validation", "invalid status", [
        { field: "status", message: "must be active or disabled" },
      ]);
    }
    if (!target.email) throw new ShopError("validation", "user has no email on record", []);
    // Disabling a user also disables the identity account (defense in depth, Q1).
    if (status === "disabled") await cognito.disableUser(target.email);
    else await cognito.enableUser(target.email);
    result = await repo.setShopUserStatus(userId, status as ShopStaffStatus, actorSub);
  }

  return result!;
}
