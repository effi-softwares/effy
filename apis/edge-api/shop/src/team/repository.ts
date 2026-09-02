// Repository for shop team management (057, US7): raw SQL, shop-scoped.
//
// ⚠ IT WRITES THE SAME RECORDS BACK-OFFICE ALREADY OWNS (`public.shop_staff` /
// `public.shop_staff_role`, 007/009). There is no shop-local roster and there must never be one —
// FR-019 forbids a second system of record, and two rosters that can disagree is worse than one
// nobody can edit.
import { query, withTransaction } from "@effy/edge-shared";

import type { ShopRole, ShopTeamMemberDTO } from "@effy/shared-types";

import { ProductError } from "../products/types";

interface MemberRow {
  staff_id: string;
  email: string | null;
  name: string | null;
  status: "active" | "disabled";
  created_at: Date;
  last_seen_at: Date | null;
  cognito_sub: string;
  roles: ShopRole[] | null;
}

export async function listTeam(shopId: string, callerSub: string): Promise<ShopTeamMemberDTO[]> {
  const res = await query<MemberRow>(
    `SELECT s.id::text AS staff_id, s.email, s.name, s.status, s.created_at, s.last_seen_at,
            s.cognito_sub,
            ARRAY_REMOVE(ARRAY_AGG(sr.role_key), NULL) AS roles
       FROM public.shop_staff s
       LEFT JOIN public.shop_staff_role sr ON sr.staff_id = s.id
      WHERE s.shop_id = $1
      GROUP BY s.id
      ORDER BY s.status, s.name NULLS LAST, s.email`,
    [shopId],
  );
  return res.rows.map((r) => ({
    staffId: r.staff_id,
    email: r.email,
    name: r.name,
    roles: (r.roles ?? []) as ShopRole[],
    status: r.status,
    createdAt: r.created_at.toISOString(),
    lastSeenAt: r.last_seen_at ? r.last_seen_at.toISOString() : null,
    isSelf: r.cognito_sub === callerSub,
  }));
}

/**
 * What we already know about this email at this shop — the check the invite path must make BEFORE
 * provisioning anything.
 *
 * ⚠ THIS EXISTS BECAUSE 009's `ensureShopUser` SILENTLY RE-ENABLES A DISABLED ACCOUNT, and this
 * feature's own research (R5) claimed it was safe to reuse as-is. It is not, for THIS caller. That
 * behaviour was written for a back-office admin deliberately managing shops, where reviving an
 * account is a documented break-glass. A shop manager typing a departed colleague's work email has no
 * idea anyone was ever stood down — and would be told "invited" while that person's sign-in came back
 * to life. 056 records the identical defect on the driver path and fixed it by REFUSING and naming
 * the situation, which is what happens here.
 */
export async function findByEmail(
  shopId: string,
  email: string,
): Promise<{ staffId: string; status: "active" | "disabled"; sameShop: boolean } | null> {
  const res = await query<{ staff_id: string; status: "active" | "disabled"; shop_id: string | null }>(
    `SELECT id::text AS staff_id, status, shop_id::text
       FROM public.shop_staff
      WHERE lower(email) = lower($1)`,
    [email],
  );
  const row = res.rows[0];
  if (!row) return null;
  return { staffId: row.staff_id, status: row.status, sameShop: row.shop_id === shopId };
}

/** Idempotent upsert keyed on the verified Cognito subject — the 007/009 join key. */
export async function upsertMember(
  shopId: string,
  sub: string,
  email: string,
  name: string,
  role: ShopRole,
): Promise<void> {
  await withTransaction(async (tx) => {
    const res = await tx.query<{ id: string }>(
      `INSERT INTO public.shop_staff (cognito_sub, email, name, status, shop_id)
       VALUES ($1, $2, $3, 'active', $4)
       ON CONFLICT (cognito_sub) DO UPDATE
         SET email = EXCLUDED.email,
             name = COALESCE(EXCLUDED.name, public.shop_staff.name),
             status = 'active',
             shop_id = EXCLUDED.shop_id,
             updated_at = now()
       RETURNING id`,
      [sub, email, name, shopId],
    );
    const staffId = res.rows[0]!.id;
    await tx.query(
      `INSERT INTO public.shop_staff_role (staff_id, role_key) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [staffId, role],
    );
  });
}

/** Roles are REPLACED, not added to — a "change role" that left the old one attached grants both. */
export async function setRole(shopId: string, staffId: string, role: ShopRole): Promise<string> {
  return withTransaction(async (tx) => {
    const member = await tx.query<{ email: string | null }>(
      `SELECT email FROM public.shop_staff WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
      [staffId, shopId],
    );
    if (member.rowCount === 0) throw new ProductError("not_found", "team member not found");

    await tx.query(`DELETE FROM public.shop_staff_role WHERE staff_id = $1`, [staffId]);
    await tx.query(`INSERT INTO public.shop_staff_role (staff_id, role_key) VALUES ($1, $2)`, [
      staffId,
      role,
    ]);
    return member.rows[0]!.email ?? "";
  });
}

export async function deactivate(shopId: string, staffId: string): Promise<string> {
  const res = await query<{ email: string | null }>(
    `UPDATE public.shop_staff SET status = 'disabled', updated_at = now()
      WHERE id = $1 AND shop_id = $2
      RETURNING email`,
    [staffId, shopId],
  );
  if (res.rowCount === 0) throw new ProductError("not_found", "team member not found");
  return res.rows[0]!.email ?? "";
}

/**
 * How many ACTIVE managers this shop would still have if `excludingStaffId` were removed.
 *
 * ⚠ THE LAST MANAGER MUST NOT BE REMOVABLE. A shop with no active manager cannot invite anyone, cannot
 * change a role, and cannot refund — it locks itself out permanently, and only back-office can undo
 * it. Counted inside the same transaction as the write it guards, because two managers standing each
 * other down simultaneously would each see one remaining.
 */
export async function activeManagersExcluding(
  shopId: string,
  excludingStaffId: string,
): Promise<number> {
  const res = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM public.shop_staff s
       JOIN public.shop_staff_role sr ON sr.staff_id = s.id
      WHERE s.shop_id = $1
        AND s.status = 'active'
        AND sr.role_key = 'shop_manager'
        AND s.id <> $2`,
    [shopId, excludingStaffId],
  );
  return res.rows[0]?.n ?? 0;
}
