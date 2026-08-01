// Authorization for a shop's same-day declaration (032), decided from the public.shop_staff platform
// record — never from a token claim (007/009 pattern).
//
// ⚠ TWO LEVELS, DELIBERATELY DIFFERENT:
//
//   read   — any active member of an active shop. Staff need to see what the shop has committed to.
//   submit — shop_manager ONLY. A same-day declaration is a standing operational commitment about
//            what the shop can physically do with its vans, staff and hours. That is a manager's
//            call, not something any member can change on a busy afternoon.
//
// The JOIN public.shop is load-bearing: an unassigned operator (shop_id IS NULL) and one at an
// inactive shop both drop out of the join, so "no shop" and "inactive shop" are refused by the same
// query with no extra branch. Fail-closed — a throw propagates to the handler, which returns 503.
import { query } from "@effy/edge-shared";

const RESOLVE_MEMBER = `
SELECT st.id AS shop_id
  FROM public.shop_staff ss
  JOIN public.shop       st ON st.id = ss.shop_id
 WHERE ss.cognito_sub = $1
   AND ss.status      = 'active'
   AND st.status      = 'active'
 LIMIT 1
`;

const RESOLVE_MANAGER = `
SELECT st.id AS shop_id
  FROM public.shop_staff      ss
  JOIN public.shop            st  ON st.id = ss.shop_id
  JOIN public.shop_staff_role ssr ON ssr.staff_id = ss.id
 WHERE ss.cognito_sub = $1
   AND ss.status      = 'active'
   AND st.status      = 'active'
   AND ssr.role_key   = 'shop_manager'
 LIMIT 1
`;

/**
 * Resolve the actor's shop id for a READ, or null.
 *
 * `null` is the uniform deny — the caller cannot tell "not a member" from "inactive shop" from
 * "unassigned", by design.
 */
export async function authorizeDeclarationRead(sub: string): Promise<string | null> {
  const res = await query<{ shop_id: string }>(RESOLVE_MEMBER, [sub]);
  return res.rows[0]?.shop_id ?? null;
}

/** Resolve the actor's shop id for a SUBMIT (shop_manager at an active shop), or null. */
export async function authorizeDeclarationWrite(sub: string): Promise<string | null> {
  const res = await query<{ shop_id: string }>(RESOLVE_MANAGER, [sub]);
  return res.rows[0]?.shop_id ?? null;
}
