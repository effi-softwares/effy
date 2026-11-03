// Writes the same `shop_staff` records back-office owns; there is no shop-local roster.
import { query, withTransaction, setIsFull } from "@effy/edge-shared";

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

export interface MemberPatch {
  name?: string;
  role?: ShopRole;
  status?: "active" | "disabled";
}

/**
 * One transaction: the shop's team rows are locked first, so two managers editing each other at once
 * cannot both leave the shop with no active manager. Returns the member's email (the Cognito username)
 * and which of role / status actually changed, for the caller to mirror into Cognito.
 */
export async function updateMember(
  shopId: string,
  staffId: string,
  callerSub: string,
  patch: MemberPatch,
): Promise<{ email: string; roleChanged: boolean; statusChanged: boolean }> {
  return withTransaction(async (tx) => {
    const team = await tx.query<{ id: string; cognito_sub: string; email: string | null; status: string; is_manager: boolean }>(
      `SELECT s.id::text AS id, s.cognito_sub, s.email, s.status,
              EXISTS (SELECT 1 FROM public.shop_staff_role r WHERE r.staff_id = s.id AND r.role_key = 'shop_manager') AS is_manager
         FROM public.shop_staff s
        WHERE s.shop_id = $1
        ORDER BY s.id
          FOR UPDATE OF s`,
      [shopId],
    );
    const target = team.rows.find((m) => m.id === staffId);
    if (!target) throw new ProductError("not_found", "team member not found");

    const roleChanged = patch.role !== undefined && (patch.role === "shop_manager") !== target.is_manager;
    const statusChanged = patch.status !== undefined && patch.status !== target.status;

    if (statusChanged && patch.status === "disabled" && target.cognito_sub === callerSub) {
      throw new ProductError("conflict", "you cannot stand yourself down");
    }

    // After this edit, would any active manager remain?
    const willBeManager = patch.role !== undefined ? patch.role === "shop_manager" : target.is_manager;
    const willBeActive = (patch.status ?? target.status) === "active";
    const otherManagers = team.rows.filter((m) => m.id !== staffId && m.status === "active" && m.is_manager).length;
    if (otherManagers === 0 && !(willBeManager && willBeActive)) {
      throw new ProductError("conflict", "this shop would be left with no manager");
    }

    if (patch.name !== undefined || statusChanged) {
      await tx.query(
        `UPDATE public.shop_staff
            SET name = COALESCE($3, name), status = COALESCE($4, status), updated_at = now()
          WHERE id = $1 AND shop_id = $2`,
        [staffId, shopId, patch.name ?? null, statusChanged ? patch.status : null],
      );
    }
    if (roleChanged) {
      // Replaced, not added to, or a role change would grant both.
      await tx.query(`DELETE FROM public.shop_staff_role WHERE staff_id = $1`, [staffId]);
      await tx.query(`INSERT INTO public.shop_staff_role (staff_id, role_key) VALUES ($1, $2)`, [staffId, patch.role]);
    }
    return { email: target.email ?? "", roleChanged, statusChanged };
  });
}

/** 103 FR-024: a shop's team is shown whole, so it is capped (`setIsFull`). */
export const isFull = (shopId: string): Promise<boolean> => setIsFull("FROM public.shop_staff WHERE shop_id = $1", [shopId]);
