import { Link } from "@tanstack/react-router"

import type { ShopLiveOrderDTO } from "@effy/shared-types"
import { BellRing } from "lucide-react"

import { cn } from "@effy/design-system"
import { Badge, Button } from "@effy/design-system/ui"
import { Panel } from "@effy/web-kit/patterns"

import { formatMoney } from "@/features/fulfillment/orderConsole"

import { isNewArrival, liveMeta } from "./model"

export function LiveOrders({ orders, now }: { orders: readonly ShopLiveOrderDTO[]; now: number }) {
  return (
    <Panel
      flush
      title="Live orders"
      description="Updating as orders arrive"
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/orders">All orders →</Link>
        </Button>
      }
    >
      {orders.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          No orders yet today. New ones appear here as they are paid.
        </p>
      ) : (
        <ul>
          {orders.map((o) => {
            const fresh = isNewArrival(o.paidAt, now)
            return (
              <li key={o.fulfillmentId} className="border-b">
                <Link
                  to="/orders/$fulfillmentId"
                  params={{ fulfillmentId: o.fulfillmentId }}
                  className={cn(
                    "flex min-h-16 w-full items-center gap-4 px-5 py-3 text-sm text-left no-underline hover:bg-row-hover max-md:px-4",
                    fresh && "animate-[sh-flash_var(--dur-highlight)_ease-out]",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono font-medium">{o.orderNumber}</span>
                      <span className="font-medium">{o.customerName}</span>
                      {fresh ? (
                        <Badge variant="info">
                          <BellRing aria-hidden="true" />
                          New
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-muted-foreground">{liveMeta(o, now)}</span>
                  </span>
                  <span className="font-semibold whitespace-nowrap tabular-nums">
                    {formatMoney(o.total, o.currency)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <p className="px-5 py-3 text-sm text-muted-foreground max-md:px-4">Showing the five most recent orders</p>
    </Panel>
  )
}
