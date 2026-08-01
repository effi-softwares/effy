"use client"

import { Truck } from "lucide-react"

import { useDeliveryContext } from "@/lib/delivery-store"
import { formatPlace } from "@/lib/delivery-display"

/**
 * The delivery expectation, beside the price (025 US2 / FR-023).
 *
 * ⚠ It states SERVICEABILITY, never a fee or a window. FR-014a forbids quoting either before
 * checkout: both depend on cart contents and origin zone, so any figure here is an estimate checkout
 * would revise — and a storefront that revises its delivery promise at payment has trained the
 * shopper not to believe it.
 *
 * ⚠ Neither state may block adding to the cart (FR-023). A shopper with no location set, or outside a
 * serviced zone, can still add items — they simply know where they stand first.
 */
export function DeliveryEstimate() {
  const context = useDeliveryContext()

  if (!context) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Truck className="size-4 shrink-0" aria-hidden="true" />
        <span>Set your delivery location to see delivery options.</span>
      </p>
    )
  }

  if (context.serviced === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Truck className="size-4 shrink-0" aria-hidden="true" />
        <span>Checking delivery to {formatPlace(context)}…</span>
      </p>
    )
  }

  return (
    <p className="flex items-center gap-2 text-sm">
      <Truck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      {context.serviced ? (
        <span>
          <span className="font-medium">Delivers to {formatPlace(context)}.</span>{" "}
          <span className="text-muted-foreground">Options and cost at checkout.</span>
        </span>
      ) : (
        <span className="text-muted-foreground">
          We don&rsquo;t deliver to {formatPlace(context)} yet — you can still add this to your cart.
        </span>
      )}
    </p>
  )
}
