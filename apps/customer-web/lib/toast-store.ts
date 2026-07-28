"use client"

/**
 * Transient feedback (025 US4 / FR-034, FR-039).
 *
 * ⚠ Why not `sonner`, which this repo already depends on: it is forbidden on the guest path
 * (contracts/customer-ui.contract.md §1) because every public route has a measured byte budget. The
 * primitive stays the platform standard on authenticated routes and both consoles; here it is ~40
 * lines against the same `useSyncExternalStore` pattern `cart-store.ts` established.
 *
 * ⚠ AT MOST ONE action per toast (FR-034). A transient message with two competing choices is a
 * decision the shopper has no time to make.
 */
import { useSyncExternalStore } from "react"

export interface Toast {
  id: string
  message: string
  tone: "success" | "error"
  action?: { label: string; run: () => void }
}

const DURATION_MS = 5000

let toasts: Toast[] = []
let counter = 0
const listeners = new Set<() => void>()

function emit(next: Toast[]): void {
  toasts = next
  listeners.forEach((l) => l())
}

/** Show a toast. Returns its id so a caller can dismiss it early. */
export function toast(
  message: string,
  options: { tone?: Toast["tone"]; action?: Toast["action"] } = {},
): string {
  const id = `t${++counter}`
  emit([...toasts, { id, message, tone: options.tone ?? "success", action: options.action }])
  // Auto-dismiss. A toast that lingers becomes furniture and stops being noticed.
  if (typeof window !== "undefined") {
    window.setTimeout(() => dismissToast(id), DURATION_MS)
  }
  return id
}

export function dismissToast(id: string): void {
  emit(toasts.filter((t) => t.id !== id))
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const emptySnapshot: Toast[] = []

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    subscribe,
    () => toasts,
    () => emptySnapshot,
  )
}

/** Reset — tests only. */
export function __resetToasts(): void {
  toasts = []
  counter = 0
}
