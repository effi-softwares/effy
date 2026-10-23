import type { PoolClient } from "pg";

import { query, withTransaction } from "@effy/edge-shared";

import {
  KNOWN_ROLES,
  type ShopLifecycleStatus,
  type ShopRole,
  type ShopStaffRecord,
  type ShopStaffStatus,
} from "./types";

interface StaffRow {
  cognito_sub: string;
  email: string | null;
  status: ShopStaffStatus;
  last_seen_at: Date | null;
  role_keys: string[] | null;
  shop_id: string | null;
  shop_code: string | null;
  shop_name: string | null;
  shop_status: ShopLifecycleStatus | null;
}

const READ_BY_ID = `
SELECT ss.cognito_sub, ss.email, ss.status, ss.last_seen_at,
       COALESCE(array_agg(ssr.role_key) FILTER (WHERE ssr.role_key IS NOT NULL), '{}') AS role_keys,
       st.id     AS shop_id,
       st.code   AS shop_code,
       st.name   AS shop_name,
       st.status AS shop_status
  FROM public.shop_staff ss
  LEFT JOIN public.shop_staff_role ssr ON ssr.staff_id = ss.id
  LEFT JOIN public.shop           st  ON st.id = ss.shop_id
 WHERE ss.id = $1
 GROUP BY ss.id, st.id
`;

// COALESCE keeps a provisioned email when the token has none. `status` and `shop_id` are never written from a token.
const UPSERT_ON_CONTACT = `
INSERT INTO public.shop_staff (cognito_sub, email, last_seen_at)
     VALUES ($1, $2, now())
ON CONFLICT (cognito_sub)
  DO UPDATE SET email        = COALESCE(EXCLUDED.email, public.shop_staff.email),
                last_seen_at = now(),
                updated_at   = now()
  RETURNING id
`;

const DELETE_STALE_ROLES = `
DELETE FROM public.shop_staff_role WHERE staff_id = $1 AND role_key <> ALL($2::text[])
`;

const GRANT_ROLE = `
INSERT INTO public.shop_staff_role (staff_id, role_key) VALUES ($1, $2)
ON CONFLICT DO NOTHING
`;

/** Role, status and shop scope in one predicate; the join on public.shop drops unassigned and inactive. The groups claim is not consulted. */
const AUTHORIZE_SHOP_MANAGER = `
SELECT EXISTS (
  SELECT 1
    FROM public.shop_staff ss
    JOIN public.shop_staff_role ssr ON ssr.staff_id = ss.id
    JOIN public.shop            st  ON st.id = ss.shop_id
   WHERE ss.cognito_sub = $1
     AND ss.status      = 'active'
     AND st.status      = 'active'
     AND ssr.role_key   = 'shop_manager'
) AS ok
`;

/** Upsert on the unique `cognito_sub` then reconcile roles, in one transaction. */
export async function upsertOnContact(
  sub: string,
  email: string | null,
  tokenRoles: readonly string[],
): Promise<ShopStaffRecord> {
  const desired = tokenRoles.filter((r): r is ShopRole =>
    (KNOWN_ROLES as readonly string[]).includes(r),
  );

  return withTransaction(async (client) => {
    const up = await client.query<{ id: string }>(UPSERT_ON_CONTACT, [sub, email]);
    const staffId = up.rows[0]?.id;
    if (!staffId) throw new Error("shop staff: upsert returned no id");

    await client.query(DELETE_STALE_ROLES, [staffId, desired]);
    for (const role of desired) {
      await client.query(GRANT_ROLE, [staffId, role]);
    }

    return mapRow(await readById(client, staffId));
  });
}

async function readById(client: PoolClient, staffId: string): Promise<StaffRow> {
  const res = await client.query<StaffRow>(READ_BY_ID, [staffId]);
  const row = res.rows[0];
  if (!row) throw new Error("shop staff: record vanished mid-transaction");
  return row;
}

/**
 * The refund gate: a manager (shop_staff is not enough: a refund is irreversible money) at a shop with a
 * portion of this order (an exists). The shop id comes from the same row that granted it.
 */
const AUTHORIZE_SHOP_REFUND = `
SELECT ss.shop_id::text AS shop_id
  FROM public.shop_staff ss
  JOIN public.shop_staff_role ssr ON ssr.staff_id = ss.id
  JOIN public.shop            st  ON st.id = ss.shop_id
 WHERE ss.cognito_sub = $1
   AND ss.status      = 'active'
   AND st.status      = 'active'
   AND ssr.role_key   = 'shop_manager'
   AND EXISTS (
         SELECT 1 FROM public.shop_fulfillment f
          WHERE f.order_id = $2 AND f.shop_id = ss.shop_id
       )
 LIMIT 1
`;

/** null when they may not. */
export async function authorizeShopRefund(sub: string, orderId: string): Promise<string | null> {
  const res = await query<{ shop_id: string }>(AUTHORIZE_SHOP_REFUND, [sub, orderId]);
  return res.rows[0]?.shop_id ?? null;
}

export async function authorizeShopManager(sub: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(AUTHORIZE_SHOP_MANAGER, [sub]);
  return res.rows[0]?.ok ?? false;
}

function mapRow(row: StaffRow): ShopStaffRecord {
  const roles = (row.role_keys ?? []).filter((r): r is ShopRole =>
    (KNOWN_ROLES as readonly string[]).includes(r),
  );

  return {
    subject: row.cognito_sub,
    email: row.email,
    roles,
    status: row.status,
    shop:
      row.shop_id && row.shop_code && row.shop_name !== null
        ? {
            id: row.shop_id,
            code: row.shop_code,
            name: row.shop_name,
            status: row.shop_status ?? "disabled",
          }
        : null,
    lastSeenAt: (row.last_seen_at ?? new Date()).toISOString(),
  };
}
