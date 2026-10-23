// Decided from public.shop_staff, never the token. Any active member of an active shop manages the
// catalogue; the join on public.shop drops unassigned operators and inactive shops alike. Every product
// query is then scoped to this resolved shop id. A throw propagates.
import { query } from "@effy/edge-shared";

const RESOLVE_SHOP_MEMBER = `
SELECT st.id AS shop_id
  FROM public.shop_staff ss
  JOIN public.shop       st ON st.id = ss.shop_id
 WHERE ss.cognito_sub = $1
   AND ss.status      = 'active'
   AND st.status      = 'active'
 LIMIT 1
`;

/** null is the uniform deny. */
export async function authorizeShopMember(sub: string): Promise<string | null> {
  const res = await query<{ shop_id: string }>(RESOLVE_SHOP_MEMBER, [sub]);
  return res.rows[0]?.shop_id ?? null;
}
