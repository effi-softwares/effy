import { Link } from "@tanstack/react-router"

import type { ShopLiveOrderDTO } from "@effy/shared-types"
import { BellRing } from "lucide-react"

import { cn } from "@effy/design-system"

import { formatMoney } from "@/features/fulfillment/orderConsole"

import { isNewArrival, liveMeta } from "./model"

export function LiveOrders({ orders, now }: { orders: readonly ShopLiveOrderDTO[]; now: number }) {
  return (
    <section className="ef-panel min-w-0">
      <div className="ef-panel__head">
        <div className="min-w-0 flex-1">
          <h2 className="ef-panel__title">Live orders</h2>
          <p className="ef-panel__desc">Updating as orders arrive</p>
        </div>
        <Link to="/orders" className="text-sm font-medium text-foreground no-underline hover:underline">
          All orders →
        </Link>
      </div>

      {orders.length === 0 ? (
        <p className="px-5 py-6 text-muted-foreground">No orders yet today. New ones appear here as they are paid.</p>
      ) : (
        <ul>
          {orders.map((o) => {
            const fresh = isNewArrival(o.paidAt, now)
            return (
              <li key={o.fulfillmentId} className="border-b border-border">
                <Link
                  to="/orders/$fulfillmentId"
                  params={{ fulfillmentId: o.fulfillmentId }}
                  className={cn(
                    "flex min-h-18 w-full items-center gap-4 px-5 py-3 text-left no-underline hover:bg-row-hover max-md:px-4",
                    fresh && "animate-[sh-flash_var(--dur-highlight)_ease-out]",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="ef-code font-medium">{o.orderNumber}</span>
                      <span className="font-medium">{o.customerName}</span>
                      {fresh ? (
                        <span className="ef-st ef-st--info">
                          <BellRing aria-hidden="true" />
                          New
                        </span>
                      ) : null}
                    </span>
                    <span className="ef-sub truncate">{liveMeta(o, now)}</span>
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
    </section>
  )
}
