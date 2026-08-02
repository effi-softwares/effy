"use client"

import { useEffect } from "react"

import { recordView } from "@/lib/recently-viewed"

/** Records a product view into the device-local recently-viewed list (FR-012) + the funnel. Renders nothing. */
export function RecordView({ productId }: { productId: string }) {
  useEffect(() => {
    recordView(productId)
    // ⚠ DYNAMIC import (027's rule). A static `import { capture } from "@/lib/telemetry"`
    // here rides the ALWAYS-LOADED guest chunk and cost +1.0 KB on four routes last time it
    // was tried. Paying for the module at the moment of the event costs a guest nothing.
    void import("@/lib/telemetry").then(({ capture }) =>
      capture({ name: "product_viewed", props: { productId } }),
    )
  }, [productId])
  return null
}
