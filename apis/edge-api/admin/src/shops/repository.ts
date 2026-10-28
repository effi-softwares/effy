// Every mutation writes its audit row in the same transaction.
import type { PoolClient } from "pg";

import { likePattern, limitOffsetClause, orderBy, query, runOffsetPage, withTransaction } from "@effy/edge-shared";

import { SHOP_LIST, type ShopListRequest } from "./list";

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
  SHOP_LIFECYCLE_STATUSES,
  SHOP_ROLES,
} from "./types";

interface ShopRow {
  id: string;
  code: string;
  name: string;
  status: ShopLifecycleStatus;
  contact_phone: string | null;
  notes: string | null;
  address_line1: string | null;
  address_line2: string | null;
  suburb: string | null;
  postcode: string | null;
  state: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ShopListRow {
  id: string;
  code: string;
  name: string;
  status: ShopLifecycleStatus;
  user_count: string;
  has_address: boolean;
  scanned: number;
  not_scanned: number;
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

function mapShop(row: ShopRow): Shop {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    contactPhone: row.contact_phone,
    notes: row.notes,
    // Address only, never coordinates.
    address: {
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      suburb: row.suburb,
      postcode: row.postcode,
      state: row.state as Shop["address"]["state"],
    },
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

function asConflict(err: unknown, message: string): ShopError {
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
    return new ShopError("conflict", message);
  }
  throw err;
}

/** The shop an email is already assigned to, or null: one user, one shop. */
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

export async function listShops(req: ShopListRequest): Promise<{ items: ShopListItem[]; total: number; page: number }> {
  const result = await runOffsetPage(req, async (read) => {
    const args: unknown[] = [req.filters.status ?? null, req.q ? likePattern(req.q) : null, LABEL_SCAN_DAYS];
    const paging = limitOffsetClause(read, args);
    const res = await query<ShopListRow & { full_count: string }>(
      `SELECT s.id, s.code, s.name, s.status,
              -- ⚠ whether a driver could be sent here at all. The address itself is NOT
              -- selected — a register does not need a street, and a shop's location should not travel
              -- further than it has to.
              (s.address_line1 IS NOT NULL) AS has_address,
              count(ss.id) AS user_count,
              -- The register shows each shop's label-scanning rate, the same count the shop page reads.
              (SELECT count(*) FILTER (WHERE ph.handover_method = 'scan')::int
                 FROM public.package_handover ph
                 JOIN public.shop_fulfillment sf ON sf.id = ph.shop_fulfillment_id
                WHERE sf.shop_id = s.id AND ph.recorded_at >= now() - make_interval(days => $3)) AS scanned,
              (SELECT count(*) FILTER (WHERE ph.handover_method <> 'scan')::int
                 FROM public.package_handover ph
                 JOIN public.shop_fulfillment sf ON sf.id = ph.shop_fulfillment_id
                WHERE sf.shop_id = s.id AND ph.recorded_at >= now() - make_interval(days => $3)) AS not_scanned,
              count(*) OVER() AS full_count
         FROM public.shop s
         LEFT JOIN public.shop_staff ss ON ss.shop_id = s.id
        WHERE ($1::text IS NULL OR s.status = $1)
          AND ($2::text IS NULL OR s.code ILIKE $2 OR s.name ILIKE $2)
        GROUP BY s.id
        ${orderBy(SHOP_LIST, req)}
        ${paging}`,
      args,
    );
    return res.rows;
  });
  return {
    items: result.rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      status: r.status,
      userCount: Number(r.user_count),
      hasAddress: r.has_address,
      labelScanning: { scanned: Number(r.scanned ?? 0), notScanned: Number(r.not_scanned ?? 0), sinceDays: LABEL_SCAN_DAYS },
    })),
    total: result.total,
    page: result.page,
  };
}

/** The register's view counts (status), for the search (103 FR-017). */
export async function shopViewCounts(q: string | null): Promise<Record<"all" | ShopLifecycleStatus, number>> {
  const res = await query<Record<string, number>>(
    `SELECT count(*)::int AS all,
            ${SHOP_LIFECYCLE_STATUSES.map((st) => `count(*) FILTER (WHERE s.status = '${st}')::int AS "${st}"`).join(",\n            ")}
       FROM public.shop s
      WHERE ($1::text IS NULL OR s.code ILIKE $1 OR s.name ILIKE $1)`,
    [q ? likePattern(q) : null],
  );
  return res.rows[0] as Record<"all" | ShopLifecycleStatus, number>;
}

async function readShop(shopId: string): Promise<Shop | null> {
  const res = await query<ShopRow>(
    `SELECT id, code, name, status, contact_phone, notes,
            address_line1, address_line2, suburb, postcode, state,
            created_at, updated_at
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

/** null when the shop does not exist. */
export async function getShopDetail(shopId: string): Promise<ShopDetail | null> {
  const shop = await readShop(shopId);
  if (!shop) return null;
  const [users, labelScanning, packScanRequired] = await Promise.all([
    readRoster(shopId),
    readLabelScanning(shopId),
    // Written only by fleet's pack-scanning route.
    query<{ pack_scan_required: boolean }>(`SELECT pack_scan_required FROM public.shop WHERE id = $1`, [shopId])
      .then((r) => r.rows[0]?.pack_scan_required ?? false),
  ]);
  return { ...shop, users, labelScanning, packScanRequired };
}

const LABEL_SCAN_DAYS = 30;

/** Recorded hand-overs over 30 days, scanned or by hand. Nothing recorded counts as nothing, never "not scanned". */
async function readLabelScanning(shopId: string): Promise<{ scanned: number; notScanned: number; sinceDays: number }> {
  const res = await query<{ scanned: number; not_scanned: number }>(
    `SELECT count(*) FILTER (WHERE ph.handover_method = 'scan')::int  AS scanned,
            count(*) FILTER (WHERE ph.handover_method <> 'scan')::int AS not_scanned
       FROM public.package_handover ph
       JOIN public.shop_fulfillment sf ON sf.id = ph.shop_fulfillment_id
      WHERE sf.shop_id = $1
        AND ph.recorded_at >= now() - make_interval(days => $2)`,
    [shopId, LABEL_SCAN_DAYS],
  );
  const r = res.rows[0];
  return { scanned: Number(r?.scanned ?? 0), notScanned: Number(r?.not_scanned ?? 0), sinceDays: LABEL_SCAN_DAYS };
}

/** Throws not_found if absent, conflict if the user is another shop's. */
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

/** Newest first. */
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

/** One transaction, keyed on the Cognito `sub` so the shop service's reconcile matches it. */
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
        // No address on create; it is set through update.
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

/** The code is immutable. */
export async function updateShop(
  shopId: string,
  values: {
    name: string;
    contactPhone: string | null;
    notes: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    suburb?: string | null;
    postcode?: string | null;
    state?: string | null;
  },
  actorSub: string,
): Promise<ShopDetail> {
  await withTransaction(async (client) => {
    // Address fields use presence: a key with null clears, an absent key leaves alone.
    const sets = [
      "name = $2",
      "contact_phone = $3",
      "notes = $4",
    ];
    const args: unknown[] = [shopId, values.name, values.contactPhone, values.notes];
    for (const [key, col] of [
      ["addressLine1", "address_line1"],
      ["addressLine2", "address_line2"],
      ["suburb", "suburb"],
      ["postcode", "postcode"],
      ["state", "state"],
    ] as const) {
      if (!(key in values)) continue;
      args.push(values[key] ?? null);
      sets.push(`${col} = $${args.length}`);
    }
    const res = await client.query<{ id: string }>(
      `UPDATE public.shop SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $1 RETURNING id`,
      args,
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

/** Null when the shop does not exist. */
export async function shopStatus(shopId: string): Promise<ShopLifecycleStatus | null> {
  const res = await query<{ status: ShopLifecycleStatus }>(
    `SELECT status FROM public.shop WHERE id = $1`,
    [shopId],
  );
  return res.rows[0]?.status ?? null;
}

/** Only a dependent-free shop; otherwise conflict (disable instead). */
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

/** Already provisioned in Cognito, keyed on the sub. */
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
