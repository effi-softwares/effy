import { Link } from "@tanstack/react-router"

import type { ShopLiveOrderDTO } from "@effy/shared-types"
import { BellRing } from "lucide-react"

import { cn } from "@effy/design-system"

import { formatMoney } from "@/features/fulfillment/orderConsole"

import { isNewArrival, liveMeta } from "./model"

/**
 * "Live orders" — the five most recent, ageing in place.
 *
 * Every row opens the order it names. The imported design generated arrivals on a timer and had
 * to give some rows a default cursor and a "still coming in" toast, because their detail pages did
 * not exist. On this platform a shop learns of an order only after the payment transaction has
 * committed and fanned it out, so that state is unrepresentable — and the rule the design was
 * working around ("never send a row to a different order's id") holds by construction here.
 *
 * A new arrival tints blue for 600 ms (the motion board's highlight) and carries a blue "New" badge
 * for its first minute — attention is blue in this identity, green only ever means done. The word
 * is always there, so the row reads as new in greyscale and to a screen reader.
 */
export function LiveOrders({ orders, now }: { orders: readonly ShopLiveOrderDTO[]; now: number }) {
  return (
    <section className="bo-panel min-w-0">
      <div className="bo-panel__head">
        <div className="min-w-0 flex-1">
          <h2 className="bo-panel__title">Live orders</h2>
          <p className="bo-panel__desc">Updating as orders arrive</p>
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
                    "flex min-h-[72px] w-full items-center gap-4 px-5 py-3 text-left no-underline hover:bg-[var(--row-hover)] max-md:px-4",
                    fresh && "bo-flash",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="bo-code font-medium">{o.orderNumber}</span>
                      <span className="font-medium">{o.customerName}</span>
                      {fresh ? (
                        <span className="bo-st bo-st--info">
                          <BellRing aria-hidden="true" />
                          New
                        </span>
                      ) : null}
                    </span>
                    <span className="bo-sub truncate">{liveMeta(o, now)}</span>
                  </span>
                  <span className="font-semibold whitespace-nowrap tabular-nums">{formatMoney(o.total, o.currency)}</span>
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
