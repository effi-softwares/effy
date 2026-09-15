import { Link } from "@tanstack/react-router"

import type { ShopLiveOrderDTO } from "@effy/shared-types"

import { formatMoney } from "@/features/fulfillment/orderConsole"

import { isNewArrival, liveMeta } from "./model"

/**
 * "Live orders" — the five most recent, ageing in place (058, FR-008/FR-009).
 *
 * ⚠ EVERY ROW OPENS THE ORDER IT NAMES. The imported design generated arrivals on a timer and had
 * to give some rows a default cursor and a "still coming in" toast, because their detail pages did
 * not exist. On this platform a shop learns of an order only after the payment transaction has
 * committed and fanned it out (019), so that state is unrepresentable — and the rule the design was
 * working around ("never send a row to a different order's id") holds by construction here.
 *
 * ⚠ THE `New` BADGE IS A DOT, NOT GREEN TEXT. The design used `--success` as a text colour at
 * 4.00:1; the constitution is explicit that success is a NON-TEXT indicator (below the 4.5:1 text
 * bar). The dot carries the colour, the word carries the meaning, and the row still reads as new in
 * greyscale.
 *
 * ⚠ THE NEWEST ROW IS `bg-muted`, not success-soft — same reason.
 */
export function LiveOrders({ orders, now }: { orders: readonly ShopLiveOrderDTO[]; now: number }) {
  return (
    <section className="bg-background overflow-hidden rounded-[var(--radius)] border">
      <header className="flex items-center gap-3 border-b px-[18px] py-4">
        <div className="grid min-w-0 gap-[3px]">
          <div className="flex items-center gap-2">
            {/* A non-text indicator, and the one animation on the screen. `motion-reduce` turns it
                off: a pulsing dot is exactly what vestibular-sensitivity settings exist for. */}
            <span
              aria-hidden="true"
              className="bg-success size-[7px] shrink-0 animate-pulse rounded-full motion-reduce:animate-none"
            />
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Live orders</h2>
          </div>
          <p className="text-muted-foreground text-[12.5px]">Updating as orders arrive</p>
        </div>
        <div className="flex-1" />
        <Link
          to="/orders"
          className="text-muted-foreground hover:text-foreground text-[13px] font-medium no-underline"
        >
          All orders →
        </Link>
      </header>

      {orders.length === 0 ? (
        <p className="text-muted-foreground px-[18px] py-6 text-sm">
          No orders yet today. New ones appear here as they are paid.
        </p>
      ) : (
        <ul>
          {orders.map((o, i) => (
            <li key={o.fulfillmentId}>
              <Link
                to="/orders/$fulfillmentId"
                params={{ fulfillmentId: o.fulfillmentId }}
                className={
                  "hover:bg-accent flex w-full items-center gap-3 border-b px-[18px] py-[14px] text-left no-underline" +
                  (i === 0 && isNewArrival(o.paidAt, now) ? " bg-muted" : "")
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground font-mono text-[12.5px]">
                      {o.orderNumber}
                    </span>
                    <span className="text-[13.5px] font-medium">{o.customerName}</span>
                    {isNewArrival(o.paidAt, now) ? (
                      <span className="border-border flex items-center gap-1.5 rounded-full border px-[7px] py-px text-[11px] font-medium">
                        <span aria-hidden="true" className="bg-success size-1.5 rounded-full" />
                        New
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground mt-1 block truncate text-xs">
                    {liveMeta(o, now)}
                  </span>
                </span>
                <span className="text-[13.5px] font-medium tabular-nums whitespace-nowrap">
                  {formatMoney(o.total, o.currency)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground px-[18px] py-[13px] text-[12.5px]">
        Showing the five most recent orders
      </p>
    </section>
  )
}
