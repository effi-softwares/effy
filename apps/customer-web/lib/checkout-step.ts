"use client"

import { useSyncExternalStore } from "react"

/**
 * Which step of checkout the customer is on: 1 Delivery · 2 Payment · 3 Done.
 *
 * The step indicator lives in the checkout header, which is rendered by the layout; the step itself
 * is state inside the checkout flow, several components down. This is the smallest thing that lets
 * the one tell the other - no context provider wrapping the layout, no prop through the page.
 *
 * Display only. Nothing may branch on it: what the customer can do next is decided by the checkout
 * flow's own state and, in the end, by the server.
 */
export type CheckoutStepNumber = 1 | 2 | 3

let current: CheckoutStepNumber = 1
const listeners = new Set<() => void>()

export function setCheckoutStep(step: CheckoutStepNumber): void {
  if (step === current) return
  current = step
  listeners.forEach((l) => l())
}

export function useCheckoutStep(): CheckoutStepNumber {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
    () => 1,
  )
}
