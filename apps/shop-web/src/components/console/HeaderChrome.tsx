import { useLocation, useNavigate, useParams, useSearch } from "@tanstack/react-router"

import { OrderPager } from "@/features/fulfillment/components/OrderPager"
import { validateOrdersSearch } from "@/features/fulfillment/orderConsole"

/**
 * The header's right-hand side (057 A3 revision 2).
 *
 * ⚠ NO SEARCH, NO PRIMARY ACTION, NO THEME TOGGLE. Search lives only on the Orders list, where it has a
 * list to narrow; every screen carries its own action where the work is; appearance stays in the
 * sidebar user menu (Light / Dark / Follow-System).
 *
 * ⚠ ON ORDER DETAIL — AND ONLY THERE — it carries the order pagination. The page body has no second
 * copy. It walks the list the order was opened from: the route's search params ARE that list.
 */
export function HeaderChrome() {
  const { pathname } = useLocation()
  const params = useParams({ strict: false }) as { fulfillmentId?: string }
  const search = useSearch({ strict: false }) as Record<string, unknown>
  const navigate = useNavigate()

  if (!pathname.startsWith("/orders/") || !params.fulfillmentId) return null

  return (
    <OrderPager
      fulfillmentId={params.fulfillmentId}
      search={validateOrdersSearch(search)}
      onNavigate={(fulfillmentId, next) =>
        void navigate({ to: "/orders/$fulfillmentId", params: { fulfillmentId }, search: next })
      }
    />
  )
}
