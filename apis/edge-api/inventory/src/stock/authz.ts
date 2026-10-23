/**
 * Decided from the platform's records, never a token claim. The shop gate is role-agnostic: both
 * shop roles manage stock, and the append-only movement record is the accountability control.
 * Back-office reads are open to all staff; writes are admin/manager.
 */

import { query } from "@effy/edge-shared";

/**
 * Membership only, returning the shop_id in the same round trip. The join on public.shop drops an
 * unassigned operator and an inactive shop alike.
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

/** null is the uniform deny. A throw propagates, never an implicit allow. */
export async function authorizeShopMember(sub: string): Promise<string | null> {
  const res = await query<{ shop_id: string }>(RESOLVE_SHOP_MEMBER, [sub]);
  return res.rows[0]?.shop_id ?? null;
}

/** The back-office path's equivalent of the join above. */
export async function shopIsActive(shopId: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM public.shop WHERE id = $1 AND status = 'active') AS ok`,
    [shopId],
  );
  return res.rows[0]?.ok === true;
}
