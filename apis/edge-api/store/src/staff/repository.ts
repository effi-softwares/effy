import type { PoolClient } from "pg";

import { query, withTransaction } from "@effy/edge-shared";

import {
  KNOWN_ROLES,
  type StoreRole,
  type StoreStaffRecord,
  type StoreStaffStatus,
} from "./types";

// Raw SQL as named constants, explicit row → domain mapping, nothing wire-shaped escaping this
// file (constitution Principle VI: repository pattern, no ORM, no query builder).

interface StaffRow {
  cognito_sub: string;
  email: string | null;
  status: StoreStaffStatus;
  last_seen_at: Date | null;
  role_keys: string[] | null;
  store_id: string | null;
  store_code: string | null;
  store_name: string | null;
  store_is_active: boolean | null;
}

const READ_BY_ID = `
SELECT ss.cognito_sub, ss.email, ss.status, ss.last_seen_at,
       COALESCE(array_agg(ssr.role_key) FILTER (WHERE ssr.role_key IS NOT NULL), '{}') AS role_keys,
       st.id        AS store_id,
       st.code      AS store_code,
       st.name      AS store_name,
       st.is_active AS store_is_active
  FROM public.store_staff ss
  LEFT JOIN public.store_staff_role ssr ON ssr.staff_id = ss.id
  LEFT JOIN public.store           st  ON st.id = ss.store_id
 WHERE ss.id = $1
 GROUP BY ss.id, st.id
`;

// COALESCE(EXCLUDED.email, store_staff.email): a token that carries no email must never clobber an
// email the operator provisioning step already set (research R6). `status` and `store_id` are
// absent from this statement on purpose — they are platform-owned and never written from a token.
const UPSERT_ON_CONTACT = `
INSERT INTO public.store_staff (cognito_sub, email, last_seen_at)
     VALUES ($1, $2, now())
ON CONFLICT (cognito_sub)
  DO UPDATE SET email        = COALESCE(EXCLUDED.email, public.store_staff.email),
                last_seen_at = now(),
                updated_at   = now()
  RETURNING id
`;

const DELETE_STALE_ROLES = `
DELETE FROM public.store_staff_role WHERE staff_id = $1 AND role_key <> ALL($2::text[])
`;

const GRANT_ROLE = `
INSERT INTO public.store_staff_role (staff_id, role_key) VALUES ($1, $2)
ON CONFLICT DO NOTHING
`;

/**
 * The manager gate — one predicate, three terms, each owned by a different place.
 *
 * The `JOIN public.store` is load-bearing: an unassigned operator (store_id IS NULL) and one at an
 * inactive store both drop out of the join, so "no store" and "inactive store" are refused by the
 * same query with no extra branch. The cognito:groups claim is NOT consulted (FR-021).
 */
const AUTHORIZE_STORE_MANAGER = `
SELECT EXISTS (
  SELECT 1
    FROM public.store_staff ss
    JOIN public.store_staff_role ssr ON ssr.staff_id = ss.id
    JOIN public.store            st  ON st.id = ss.store_id
   WHERE ss.cognito_sub = $1
     AND ss.status      = 'active'
     AND st.is_active
     AND ssr.role_key   = 'store_manager'
) AS ok
`;

/**
 * Record the operator on first contact, refresh them on every later one — idempotently.
 *
 * One transaction: upsert on the unique `cognito_sub`, then reconcile roles from the claim. Two
 * simultaneous first requests therefore resolve to exactly one row (SC-011).
 */
export async function upsertOnContact(
  sub: string,
  email: string | null,
  tokenRoles: readonly string[],
): Promise<StoreStaffRecord> {
  const desired = tokenRoles.filter((r): r is StoreRole =>
    (KNOWN_ROLES as readonly string[]).includes(r),
  );

  return withTransaction(async (client) => {
    const up = await client.query<{ id: string }>(UPSERT_ON_CONTACT, [sub, email]);
    const staffId = up.rows[0]?.id;
    if (!staffId) throw new Error("store staff: upsert returned no id");

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
  if (!row) throw new Error("store staff: record vanished mid-transaction");
  return row;
}

export async function authorizeStoreManager(sub: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(AUTHORIZE_STORE_MANAGER, [sub]);
  return res.rows[0]?.ok ?? false;
}

function mapRow(row: StaffRow): StoreStaffRecord {
  const roles = (row.role_keys ?? []).filter((r): r is StoreRole =>
    (KNOWN_ROLES as readonly string[]).includes(r),
  );

  return {
    subject: row.cognito_sub,
    email: row.email,
    roles,
    status: row.status,
    store:
      row.store_id && row.store_code && row.store_name !== null
        ? {
            id: row.store_id,
            code: row.store_code,
            name: row.store_name,
            isActive: row.store_is_active ?? false,
          }
        : null,
    lastSeenAt: (row.last_seen_at ?? new Date()).toISOString(),
  };
}
