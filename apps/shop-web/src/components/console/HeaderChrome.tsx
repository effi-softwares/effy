import { useLocation, useNavigate, useParams, useSearch } from "@tanstack/react-router"

import { OrderPager } from "@/features/fulfillment/components/OrderPager"
import { validateOrdersSearch } from "@/features/fulfillment/orderConsole"

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
