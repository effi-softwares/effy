"use client"

import { useEffect } from "react"

import { clearCart } from "@/lib/cart-store"
import { capture } from "@/lib/telemetry"

/** Empties the device-local guest cart once the order is placed (FR-032) + logs the funnel end. */
export function ClearCart({ orderId }: { orderId: string }) {
  useEffect(() => {
    clearCart()
    capture({ name: "order_placed", props: { orderId } })
  }, [orderId])
  return null
}
