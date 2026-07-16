// Shop catalog authorization, decided from the public.shop_staff platform record (007/009 pattern,
// research R5) — never from the token claim. The catalog is managed by ANY active shop member
// (shop_manager OR shop_staff), so this is the role-AGNOSTIC sibling of `authorizeShopManager`:
//   authorizeShopMember(sub) → the actor's active shop_id, or null (deny).
//
// The JOIN public.shop is load-bearing: an unassigned operator (shop_id IS NULL) and one at an
// inactive shop both drop out of the join, so "no shop" and "inactive shop" are refused by the same
// query with no extra branch. Every downstream product query is then scoped `WHERE shop_id = :shopId`
// from THIS resolved value — never from client input (FR-019/FR-031, SC-005). Fail-closed: a throw
// propagates to the handler, which returns 503 (never an implicit allow).
import { query } from "@effy/edge-shared";

// One predicate, membership-only (any role). Returns the shop_id so the handler can scope every
// subsequent query to it — resolving the actor's shop and authorizing are the SAME round-trip.
const RESOLVE_SHOP_MEMBER = `
SELECT st.id AS shop_id
  FROM public.shop_staff ss
  JOIN public.shop       st ON st.id = ss.shop_id
 WHERE ss.cognito_sub = $1
   AND ss.status      = 'active'
   AND st.status      = 'active'
 LIMIT 1
`;

/**
 * Resolve the actor's active shop id if they are an active member of an active shop, else null.
 *
 * `null` is the uniform deny — the caller cannot tell "not a member" from "inactive shop" from
 * "unassigned", by design (the handler returns a uniform 403 that discloses neither).
 */
export async function authorizeShopMember(sub: string): Promise<string | null> {
  const res = await query<{ shop_id: string }>(RESOLVE_SHOP_MEMBER, [sub]);
  return res.rows[0]?.shop_id ?? null;
}
