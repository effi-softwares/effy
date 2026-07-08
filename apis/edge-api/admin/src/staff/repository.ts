// Repository layer for the staff/RBAC system of record: raw parameterized SQL + explicit
// row → domain mapping (Principle VI, no ORM). Reads/writes only platform-owned admin-schema
// objects (FR-021).
import type { PoolClient } from "pg";

import { query, withTransaction } from "../lib/db";
import { KNOWN_ROLES, type BackOfficeRole, type StaffRecord, type StaffStatus } from "./types";

// Wire shape of the staff read — internal, never exported. role_keys aggregates staff_role.
interface StaffRow {
  cognito_sub: string;
  email: string;
  status: StaffStatus;
  last_seen_at: Date | null;
  role_keys: string[] | null;
}

const READ_BY_ID = `
SELECT s.cognito_sub, s.email, s.status, s.last_seen_at,
       COALESCE(array_agg(sr.role_key) FILTER (WHERE sr.role_key IS NOT NULL), '{}') AS role_keys
  FROM admin.staff s
  LEFT JOIN admin.staff_role sr ON sr.staff_id = s.id
 WHERE s.id = $1
 GROUP BY s.id
`;

// JIT provisioning (FR-019): create/refresh the staff row + reconcile roles from the token, in
// ONE transaction. Idempotent on cognito_sub — concurrent first contact yields exactly one row.
export async function upsertOnContact(
  sub: string,
  email: string,
  tokenRoles: readonly string[],
): Promise<StaffRecord> {
  const desired = tokenRoles.filter((r): r is BackOfficeRole =>
    (KNOWN_ROLES as readonly string[]).includes(r),
  );

  return withTransaction(async (client) => {
    const up = await client.query<{ id: string }>(
      `INSERT INTO admin.staff (cognito_sub, email, last_seen_at)
            VALUES ($1, $2, now())
       ON CONFLICT (cognito_sub)
         DO UPDATE SET email = EXCLUDED.email, last_seen_at = now(), updated_at = now()
        RETURNING id`,
      [sub, email],
    );
    const staffId = up.rows[0]?.id;
    if (!staffId) throw new Error("staff: upsert returned no id");

    // Reconcile to exactly `desired`: drop roles no longer held, add missing ones.
    await client.query(
      `DELETE FROM admin.staff_role WHERE staff_id = $1 AND role_key <> ALL($2::text[])`,
      [staffId, desired],
    );
    for (const role of desired) {
      await client.query(
        `INSERT INTO admin.staff_role (staff_id, role_key) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [staffId, role],
      );
    }

    return mapRow(await readById(client, staffId));
  });
}

async function readById(client: PoolClient, staffId: string): Promise<StaffRow> {
  const res = await client.query<StaffRow>(READ_BY_ID, [staffId]);
  const row = res.rows[0];
  if (!row) throw new Error("staff: record vanished mid-transaction");
  return row;
}

// Authorization decision from the platform record (FR-020): active AND holds the admin role.
// A disabled row is denied even with a valid admin token (SC-012).
export async function authorizeAdmin(sub: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM admin.staff s
         JOIN admin.staff_role sr ON sr.staff_id = s.id
        WHERE s.cognito_sub = $1 AND s.status = 'active' AND sr.role_key = 'admin'
     ) AS ok`,
    [sub],
  );
  return res.rows[0]?.ok ?? false;
}

function mapRow(row: StaffRow): StaffRecord {
  const roles = (row.role_keys ?? []).filter((r): r is BackOfficeRole =>
    (KNOWN_ROLES as readonly string[]).includes(r),
  );
  return {
    subject: row.cognito_sub,
    email: row.email,
    roles,
    status: row.status,
    lastSeenAt: (row.last_seen_at ?? new Date()).toISOString(),
  };
}
