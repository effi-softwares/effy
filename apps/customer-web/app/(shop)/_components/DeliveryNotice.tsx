"use client"

import { formatPlace } from "@/lib/delivery-display"
import { useDeliveryContext } from "@/lib/delivery-store"

/**
 * The verdict banner, shown in the page body rather than the header so it has room for plain language.
 *
 * ⚠ Three states, and conflating any two of them is the failure mode:
 *   serviced === true   → we deliver
 *   serviced === false  → we do not deliver (browsing continues to work — FR-014)
 *   serviced === null   → we have not asked, or the check failed. NOT a refusal.
 */
export function DeliveryNotice() {
  const context = useDeliveryContext()
  if (!context || context.serviced !== false) return null
  return (
    <div className="mx-4 mt-4 rounded-lg border border-dashed px-4 py-3 text-sm sm:mx-6">
      {/* FR-041: name the place, so the refusal is about somewhere the shopper recognises. */}
      <p className="font-medium">We don&rsquo;t deliver to {formatPlace(context)} yet.</p>
      <p className="mt-1 text-muted-foreground">
        You&rsquo;re welcome to keep browsing — we&rsquo;re adding new areas regularly. Change your
        location from the header if you entered it by mistake.
      </p>
    </div>
  )
}
