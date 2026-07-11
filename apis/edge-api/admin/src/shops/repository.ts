// Repository layer for back-office shop management: raw parameterized SQL + explicit row → domain
// mapping (constitution Principle VI, no ORM). Reads/writes the customer-operational shop tables
// (public.shop*, 007) and the back-office audit log (admin.audit_log, 009). Every mutation writes
// an audit row inside the SAME transaction as the change it records (FR-016/SC-010).
import type { PoolClient } from "pg";

import { query, withTransaction } from "@effy/edge-shared";

import {
  type AuditEntry,
  type Paged,
  type Shop,
  type ShopDetail,
  ShopError,
  type ShopLifecycleStatus,
  type ShopListItem,
  type ShopRole,
  type ShopStaffStatus,
  type ShopUser,
  SHOP_ROLES,
} from "./types";

// ── Wire row shapes (internal; never exported) ───────────────────────────────────────────────

interface ShopRow {
  id: string;
  code: string;
  name: string;
  status: ShopLifecycleStatus;
  contact_phone: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ShopListRow {
  id: string;
  code: string;
  name: string;
  status: ShopLifecycleStatus;
  user_count: string; // pg bigint → string
  total: string;
}

interface ShopUserRow {
  id: string;
  cognito_sub: string;
  email: string | null;
  name: string | null;
  status: ShopStaffStatus;
  last_seen_at: Date | null;
  role_keys: string[] | null;
}

interface AuditRow {
  id: string;
  actor_sub: string;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: Record<string, unknown>;
  created_at: Date;
  total: string;
}

// ── Mappers ──────────────────────────────────────────────────────────────────────────────────

function mapShop(row: ShopRow): Shop {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    contactPhone: row.contact_phone,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapUser(row: ShopUserRow): ShopUser {
  const roles = (row.role_keys ?? []).filter((r): r is ShopRole =>
    (SHOP_ROLES as readonly string[]).includes(r),
  );
  return {
    id: row.id,
    subject: row.cognito_sub,
    email: row.email,
    name: row.name,
    roles,
    status: row.status,
    lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
  };
}

// ── Audit (written inside the mutation's transaction) ────────────────────────────────────────

async function insertAudit(
  client: PoolClient,
  actorSub: string,
  action: string,
  targetType: "shop" | "shop_staff",
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
function asConflict(err: unknown, message: string): ShopError {
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
    return new ShopError("conflict", message);
  }
  throw err;
}

// ── Reads ────────────────────────────────────────────────────────────────────────────────────

/** Returns the shop id an email is already bound to (a non-null shop assignment), or null. The
 *  one-user-one-shop invariant check (FR-009). */
export async function shopIdForEmail(email: string): Promise<string | null> {
  const res = await query<{ shop_id: string }>(
    `SELECT shop_id FROM public.shop_staff
      WHERE lower(email) = lower($1) AND shop_id IS NOT NULL
      LIMIT 1`,
    [email],
  );
  return res.rows[0]?.shop_id ?? null;
}

export async function shopExistsByCode(code: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM public.shop WHERE code = $1) AS ok`,
    [code],
  );
  return res.rows[0]?.ok ?? false;
}

export async function listShops(params: {
  page: number;
  pageSize: number;
  status: ShopLifecycleStatus | null;
  q: string | null;
}): Promise<Paged<ShopListItem>> {
  const { page, pageSize, status, q } = params;
  const res = await query<ShopListRow>(
    `SELECT s.id, s.code, s.name, s.status,
            count(ss.id) AS user_count,
            count(*) OVER() AS total
       FROM public.shop s
       LEFT JOIN public.shop_staff ss ON ss.shop_id = s.id
      WHERE ($1::text IS NULL OR s.status = $1)
        AND ($2::text IS NULL OR s.code ILIKE '%' || $2 || '%' OR s.name ILIKE '%' || $2 || '%')
      GROUP BY s.id
      ORDER BY s.code
      LIMIT $3 OFFSET $4`,
    [status, q, pageSize, (page - 1) * pageSize],
  );
  const total = res.rows[0] ? Number(res.rows[0].total) : 0;
  return {
    items: res.rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      status: r.status,
      userCount: Number(r.user_count),
    })),
    total,
    page,
    pageSize,
  };
}

async function readShop(shopId: string): Promise<Shop | null> {
  const res = await query<ShopRow>(
    `SELECT id, code, name, status, contact_phone, notes, created_at, updated_at
       FROM public.shop WHERE id = $1`,
    [shopId],
  );
  const row = res.rows[0];
  return row ? mapShop(row) : null;
}

async function readRoster(shopId: string): Promise<ShopUser[]> {
  const res = await query<ShopUserRow>(
    `SELECT ss.id, ss.cognito_sub, ss.email, ss.name, ss.status, ss.last_seen_at,
            COALESCE(array_agg(ssr.role_key) FILTER (WHERE ssr.role_key IS NOT NULL), '{}') AS role_keys
       FROM public.shop_staff ss
       LEFT JOIN public.shop_staff_role ssr ON ssr.staff_id = ss.id
      WHERE ss.shop_id = $1
      GROUP BY ss.id
      ORDER BY ss.created_at`,
    [shopId],
  );
  return res.rows.map(mapUser);
}

/** Full detail + roster. Returns null when the shop does not exist (→ 404). */
export async function getShopDetail(shopId: string): Promise<ShopDetail | null> {
  const shop = await readShop(shopId);
  if (!shop) return null;
  const users = await readRoster(shopId);
  return { ...shop, users };
}

/** The user's assignment + email, for a roster PATCH. Throws not_found if absent; conflict if the
 *  user belongs to a different shop (no reassignment, A8). */
export async function getShopUserForUpdate(
  shopId: string,
  userId: string,
): Promise<{ id: string; email: string | null; shopId: string | null; roles: ShopRole[] }> {
  const res = await query<{ id: string; email: string | null; shop_id: string | null; role_keys: string[] | null }>(
    `SELECT ss.id, ss.email, ss.shop_id,
            COALESCE(array_agg(ssr.role_key) FILTER (WHERE ssr.role_key IS NOT NULL), '{}') AS role_keys
       FROM public.shop_staff ss
       LEFT JOIN public.shop_staff_role ssr ON ssr.staff_id = ss.id
      WHERE ss.id = $1
      GROUP BY ss.id`,
    [userId],
  );
  const row = res.rows[0];
  if (!row) throw new ShopError("not_found", "shop user not found");
  if (row.shop_id !== shopId) {
    throw new ShopError("conflict", "user is not assigned to this shop");
  }
  const roles = (row.role_keys ?? []).filter((r): r is ShopRole =>
    (SHOP_ROLES as readonly string[]).includes(r),
  );
  return { id: row.id, email: row.email, shopId: row.shop_id, roles };
}

/** Shop-and-user history, newest first (FR-016/SC-010). */
export async function listShopHistory(
  shopId: string,
  page: number,
  pageSize: number,
): Promise<Paged<AuditEntry>> {
  const res = await query<AuditRow>(
    `SELECT a.id, a.actor_sub, a.action, a.target_type, a.target_id, a.detail, a.created_at,
            count(*) OVER() AS total
       FROM admin.audit_log a
      WHERE (a.target_type = 'shop' AND a.target_id = $1)
         OR (a.target_type = 'shop_staff'
             AND a.target_id IN (SELECT id FROM public.shop_staff WHERE shop_id = $1))
      ORDER BY a.created_at DESC
      LIMIT $2 OFFSET $3`,
    [shopId, pageSize, (page - 1) * pageSize],
  );
  const total = res.rows[0] ? Number(res.rows[0].total) : 0;
  return {
    items: res.rows.map((r) => ({
      id: r.id,
      actorSub: r.actor_sub,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      detail: r.detail,
      createdAt: r.created_at.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

// ── Role reconciliation helper (used by create/add/role-change) ────────────────────────────────

async function setRoles(client: PoolClient, staffId: string, roles: readonly ShopRole[]): Promise<void> {
  await client.query(
    `DELETE FROM public.shop_staff_role WHERE staff_id = $1 AND role_key <> ALL($2::text[])`,
    [staffId, roles],
  );
  for (const role of roles) {
    await client.query(
      `INSERT INTO public.shop_staff_role (staff_id, role_key) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [staffId, role],
    );
  }
}

const UPSERT_STAFF = `
INSERT INTO public.shop_staff (cognito_sub, email, name, status, shop_id)
     VALUES ($1, $2, $3, 'active', $4)
ON CONFLICT (cognito_sub)
  DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name,
                status = 'active', shop_id = EXCLUDED.shop_id, updated_at = now()
  RETURNING id
`;

// ── Writes ───────────────────────────────────────────────────────────────────────────────────

/** Create the shop and its primary manager (already provisioned in Cognito → `primary.sub`) in ONE
 *  transaction, keyed on the returned sub so 007's JIT reconcile matches it (FR-002/FR-012). */
export async function createShopWithManager(
  input: {
    code: string;
    name: string;
    contactPhone: string | null;
    notes: string | null;
    primary: { sub: string; email: string; name: string };
  },
  actorSub: string,
): Promise<ShopDetail> {
  const shopId = await withTransaction(async (client) => {
    let id: string;
    try {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO public.shop (code, name, contact_phone, notes)
              VALUES ($1, $2, $3, $4)
           ON CONFLICT (code) DO UPDATE
              SET name = EXCLUDED.name, contact_phone = EXCLUDED.contact_phone,
                  notes = EXCLUDED.notes, updated_at = now()
          RETURNING id`,
        [input.code, input.name, input.contactPhone, input.notes],
      );
      id = ins.rows[0]!.id;
    } catch (err) {
      throw asConflict(err, "a shop with this code already exists");
    }

    const up = await client.query<{ id: string }>(UPSERT_STAFF, [
      input.primary.sub,
      input.primary.email,
      input.primary.name,
      id,
    ]);
    const staffId = up.rows[0]!.id;
    await setRoles(client, staffId, ["shop_manager"]);

    await insertAudit(client, actorSub, "shop.create", "shop", id, { code: input.code });
    return id;
  });

  const detail = await getShopDetail(shopId);
  if (!detail) throw new ShopError("not_found", "shop vanished after creation");
  return detail;
}

/** Edit mutable details (name/contactPhone/notes). Code is immutable (A9) and never touched. */
export async function updateShop(
  shopId: string,
  values: { name: string; contactPhone: string | null; notes: string | null },
  actorSub: string,
): Promise<ShopDetail> {
  await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `UPDATE public.shop SET name = $2, contact_phone = $3, notes = $4, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [shopId, values.name, values.contactPhone, values.notes],
    );
    if (!res.rows[0]) throw new ShopError("not_found", "shop not found");
    await insertAudit(client, actorSub, "shop.update", "shop", shopId, { name: values.name });
  });
  return (await getShopDetail(shopId))!;
}

export async function changeShopStatus(
  shopId: string,
  from: ShopLifecycleStatus,
  to: ShopLifecycleStatus,
  actorSub: string,
): Promise<ShopDetail> {
  await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `UPDATE public.shop SET status = $2, updated_at = now() WHERE id = $1 RETURNING id`,
      [shopId, to],
    );
    if (!res.rows[0]) throw new ShopError("not_found", "shop not found");
    await insertAudit(client, actorSub, "shop.status_change", "shop", shopId, { from, to });
  });
  return (await getShopDetail(shopId))!;
}

/** Current status (for transition validation / detail). Null when the shop does not exist. */
export async function shopStatus(shopId: string): Promise<ShopLifecycleStatus | null> {
  const res = await query<{ status: ShopLifecycleStatus }>(
    `SELECT status FROM public.shop WHERE id = $1`,
    [shopId],
  );
  return res.rows[0]?.status ?? null;
}

/** Hard-delete only a dependent-free shop; otherwise conflict (disable instead — FR-006/A6). */
export async function deleteShop(shopId: string, actorSub: string): Promise<void> {
  await withTransaction(async (client) => {
    const dep = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM public.shop_staff WHERE shop_id = $1`,
      [shopId],
    );
    if (Number(dep.rows[0]?.n ?? 0) > 0) {
      throw new ShopError("conflict", "shop has users; disable it instead of deleting");
    }
    const res = await client.query<{ id: string }>(
      `DELETE FROM public.shop WHERE id = $1 RETURNING id`,
      [shopId],
    );
    if (!res.rows[0]) throw new ShopError("not_found", "shop not found");
    await insertAudit(client, actorSub, "shop.delete", "shop", shopId, {});
  });
}

/** Add a user (already provisioned in Cognito → `user.sub`) to a shop, keyed on the sub. */
export async function addShopUser(
  shopId: string,
  user: { sub: string; email: string; name: string; role: ShopRole },
  actorSub: string,
): Promise<ShopUser> {
  const staffId = await withTransaction(async (client) => {
    const shop = await client.query<{ id: string }>(`SELECT id FROM public.shop WHERE id = $1`, [
      shopId,
    ]);
    if (!shop.rows[0]) throw new ShopError("not_found", "shop not found");

    const up = await client.query<{ id: string }>(UPSERT_STAFF, [
      user.sub,
      user.email,
      user.name,
      shopId,
    ]);
    const id = up.rows[0]!.id;
    await setRoles(client, id, [user.role]);
    await insertAudit(client, actorSub, "shop_user.provision", "shop_staff", id, {
      role: user.role,
    });
    return id;
  });
  return (await readUserById(staffId))!;
}

export async function setShopUserRole(
  userId: string,
  role: ShopRole,
  actorSub: string,
): Promise<ShopUser> {
  await withTransaction(async (client) => {
    await setRoles(client, userId, [role]);
    await insertAudit(client, actorSub, "shop_user.role_change", "shop_staff", userId, { role });
  });
  return (await readUserById(userId))!;
}

export async function setShopUserStatus(
  userId: string,
  status: ShopStaffStatus,
  actorSub: string,
): Promise<ShopUser> {
  await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `UPDATE public.shop_staff SET status = $2, updated_at = now() WHERE id = $1 RETURNING id`,
      [userId, status],
    );
    if (!res.rows[0]) throw new ShopError("not_found", "shop user not found");
    await insertAudit(client, actorSub, "shop_user.status_change", "shop_staff", userId, { status });
  });
  return (await readUserById(userId))!;
}

async function readUserById(userId: string): Promise<ShopUser | null> {
  const res = await query<ShopUserRow>(
    `SELECT ss.id, ss.cognito_sub, ss.email, ss.name, ss.status, ss.last_seen_at,
            COALESCE(array_agg(ssr.role_key) FILTER (WHERE ssr.role_key IS NOT NULL), '{}') AS role_keys
       FROM public.shop_staff ss
       LEFT JOIN public.shop_staff_role ssr ON ssr.staff_id = ss.id
      WHERE ss.id = $1
      GROUP BY ss.id`,
    [userId],
  );
  const row = res.rows[0];
  return row ? mapUser(row) : null;
}
