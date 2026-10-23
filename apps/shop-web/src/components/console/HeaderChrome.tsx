import { useLocation, useNavigate, useParams, useSearch } from "@tanstack/react-router"

import { OrderPager } from "@/features/fulfillment/components/OrderPager"
import { validateOrdersSearch } from "@/features/fulfillment/orderConsole"

/**
 * The header's right-hand side: no search (only Orders has a list to narrow), no primary action, no
 * theme toggle (that is in the user menu). On order detail only, it carries the order pagination, which
 * walks the list the order was opened from (the route's search params).
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
