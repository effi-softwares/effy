"use client"

import { useEffect } from "react"

import { recordView } from "@/lib/recently-viewed"
import { capture } from "@/lib/telemetry"

/** Records a product view into the device-local recently-viewed list (FR-012) + the funnel. Renders nothing. */
export function RecordView({ productId }: { productId: string }) {
  useEffect(() => {
    recordView(productId)
    capture({ name: "product_viewed", props: { productId } })
  }, [productId])
  return null
}
