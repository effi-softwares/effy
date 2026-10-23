"use client"

import { useEffect } from "react"

import { capture } from "@/lib/telemetry"

/** Records that a delivery note was shown (once per page view). Renders nothing. */
export function DeliveryNoteSeen() {
  useEffect(() => capture({ name: "delivery_note_viewed" }), [])
  return null
}
