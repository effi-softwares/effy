// Writes the same `shop_staff` records back-office owns; there is no shop-local roster.
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
 * What is known about this email at this shop, checked before provisioning: `ensureShopUser` silently
 * re-enables a disabled account, so a reused email is refused instead.
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

/** Idempotent on the verified Cognito subject. */
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

/** Replaced, not added to, or a role change would grant both. */
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
 * Active managers left if `excludingStaffId` went. The last manager is not removable. Counted in the
 * same transaction as the write, so two managers standing each other down cannot both succeed.
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
