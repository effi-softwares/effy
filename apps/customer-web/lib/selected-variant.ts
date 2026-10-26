"use client"

import { useSyncExternalStore } from "react"

/**
 * The size the product page's buy box has selected (101), so the details further down the page follow it:
 * a flavour's allergens are that flavour's. The same idiom as `checkout-step.ts` — the buy box sets it,
 * the details read it — with no provider around the page.
 *
 * Display only. Keyed by product so a stale value from another product page is never shown.
 */
let current: { productId: string; variantId: string } | null = null
const listeners = new Set<() => void>()

export function setSelectedVariant(productId: string, variantId: string): void {
  if (current?.productId === productId && current.variantId === variantId) return
  current = { productId, variantId }
  listeners.forEach((l) => l())
}

/** The selected size of this product, else `fallback` (the size the page opened on). */
export function useSelectedVariant(productId: string, fallback: string): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => (current?.productId === productId ? current.variantId : fallback),
    () => fallback,
  )
}
