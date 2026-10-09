"use client"

import { DELIVERY_TYPE_WORDS } from "@effy/shared-types"

import { capture } from "@/lib/telemetry"

/**
 * 080 — the ONE tracking link a courier order shows when it travels as a single consignment (Q8).
 * The courier's own page; opened in a new tab. ⚠ The event carries no URL, reference or courier.
 */
export function TrackingLink({ url, courierName }: { url: string; courierName: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => capture({ name: "courier_tracking_opened" })}
      className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      data-testid="tracking-link"
    >
      {DELIVERY_TYPE_WORDS.trackParcel}
      {courierName ? <span className="text-muted-foreground">&nbsp;with {courierName}</span> : null}
    </a>
  )
}
