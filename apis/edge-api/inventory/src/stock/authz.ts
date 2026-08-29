/**
 * Stock authorization, decided from the platform's own records — never from a token claim
 * (Principle IV, the 007/009 pattern).
 *
 * ⚠ THE SHOP GATE IS ROLE-AGNOSTIC, AND THAT IS A REQUIREMENT, NOT AN OVERSIGHT (FR-010, A7).
 * BOTH shop roles manage stock. The platform's shop-floor model has said so since 020, whose FR-019a
 * records that `shop_manager` and `shop_staff` have the same access and that the append-only record —
 * here `public.stock_movement` — is the accountability control instead of a role gate. Counting a
 * shelf is the work of whoever is standing at it. This mirrors `authorizeShopMember` in
 * `edge-api/shop/src/products/authz.ts`, which calls itself "the role-AGNOSTIC sibling of
 * `authorizeShopManager`" for the same reason on the same audience.
 *
 * ⚠ The BACK-OFFICE gate is two-tier and deliberately narrower on writes (FR-025/FR-028), matching
 * 046 and 053: reading is triage, which is CSA work; writing changes another organisation's records
 * on their behalf.
 */

import { query } from "@effy/edge-shared";

/**
 * One predicate, membership-only. Returns the shop_id so resolving the actor's shop and authorizing
 * them are the SAME round trip — there is no window in which one has been decided and not the other.
 *
 * The JOIN on public.shop is load-bearing: an unassigned operator (shop_id IS NULL) and one at an
 * inactive shop both drop out of it, so "no shop" and "inactive shop" are refused by the same query
 * with no extra branch, and neither is distinguishable in the response.
 */
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
 * The acting shop operator's active shop id, or null to deny.
 *
 * `null` is the uniform deny: the caller cannot tell "not a member" from "inactive shop" from
 * "unassigned". Fail-closed — a throw propagates to the handler, which returns 503, never an
 * implicit allow.
 */
export async function authorizeShopMember(sub: string): Promise<string | null> {
  const res = await query<{ shop_id: string }>(RESOLVE_SHOP_MEMBER, [sub]);
  return res.rows[0]?.shop_id ?? null;
}

/** True when the shop exists and is active — the back-office path's equivalent of the JOIN above. */
export async function shopIsActive(shopId: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM public.shop WHERE id = $1 AND status = 'active') AS ok`,
    [shopId],
  );
  return res.rows[0]?.ok === true;
}
