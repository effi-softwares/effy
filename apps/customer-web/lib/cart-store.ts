"use client"

/**
 * The guest cart — device-local, dependency-free (this storefront ships a deliberately tiny guest
 * bundle; no TanStack/Zustand here). Lines are SNAPSHOTTED (name/price/image captured at add time) so a
 * later catalog price change never silently mutates what the guest saw (ARCHITECTURE.md / R8). On
 * sign-in the guest cart is merged into the authoritative server cart (see mergePayload / US3).
 *
 * The ordering/merge/total logic is pure (unit-tested); the localStorage + useSyncExternalStore wrapper
 * is a thin client edge.
 */
import { useSyncExternalStore } from "react"

const KEY = "effy:cart"
const MAX_QTY = 99

/**
 * The package a line falls into when the storefront read carries no opaque `packageKey` yet (021). It
 * puts everything into one anonymous package — a single-package cart, which degrades gracefully
 * (FR-007/SC-011). It is NOT a shop id; the authoritative per-shop split happens server-side at the
 * checkout quote.
 */
export const DEFAULT_PACKAGE_KEY = "pkg_default"

export interface GuestCartLine {
  productId: string
  name: string
  imageUrl: string | null
  unitPriceAmount: string
  currency: string
  quantity: number
  /**
   * OPAQUE package-grouping token (021 FR-005a). Lines sharing a packageKey ship together as one
   * anonymous "package" (one per fulfilling shop). It is captured at add-time and is NOT a shop id,
   * name, or location — a meaningless-to-the-customer string that lets the cart show the split while
   * revealing no shop (SC-006). Prices/windows only appear later, at the delivery step (an address is
   * required to quote). When the storefront read carries no key yet, everything falls into one package
   * (a single-package cart degrades gracefully — FR-007/SC-011).
   */
  packageKey: string
}

/** An anonymous package section for the cart split — the items, and an opaque key. NEVER a shop. */
export interface CartPackage {
  packageKey: string
  lines: GuestCartLine[]
}

/* ── Pure core (unit-tested) ─────────────────────────────────────────────────────────────────── */

/** Add or increment a line, clamping quantity to the max. */
export function addLine(lines: readonly GuestCartLine[], line: GuestCartLine): GuestCartLine[] {
  const existing = lines.find((l) => l.productId === line.productId)
  if (existing) {
    return lines.map((l) =>
      l.productId === line.productId
        ? { ...l, quantity: Math.min(l.quantity + line.quantity, MAX_QTY) }
        : l,
    )
  }
  return [...lines, { ...line, quantity: Math.min(Math.max(line.quantity, 1), MAX_QTY) }]
}

/** Set a line's quantity; 0 or less removes it. */
export function setLineQty(
  lines: readonly GuestCartLine[],
  productId: string,
  quantity: number,
): GuestCartLine[] {
  if (quantity <= 0) return lines.filter((l) => l.productId !== productId)
  return lines.map((l) =>
    l.productId === productId ? { ...l, quantity: Math.min(quantity, MAX_QTY) } : l,
  )
}

export function removeLine(lines: readonly GuestCartLine[], productId: string): GuestCartLine[] {
  return lines.filter((l) => l.productId !== productId)
}

/** Total item count (sum of quantities) — the cart badge. */
export function cartCount(lines: readonly GuestCartLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0)
}

/** The merge payload sent to POST /v1/cart/merge on sign-in. */
export function mergePayload(lines: readonly GuestCartLine[]): { productId: string; quantity: number }[] {
  return lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))
}

/**
 * Group cart lines into anonymous packages by `packageKey`, in first-appearance order (021 FR-005a).
 * The label the UI shows is a positional "Package N" — never the key, and never a shop. A cart whose
 * lines all share one key returns a single package (single-shop degrades gracefully — FR-007/SC-011).
 */
export function groupByPackage(lines: readonly GuestCartLine[]): CartPackage[] {
  const order: string[] = []
  const byKey = new Map<string, GuestCartLine[]>()
  for (const line of lines) {
    const key = line.packageKey
    if (!byKey.has(key)) {
      byKey.set(key, [])
      order.push(key)
    }
    byKey.get(key)!.push(line)
  }
  return order.map((packageKey) => ({ packageKey, lines: byKey.get(packageKey)! }))
}

/* ── Client store (localStorage + useSyncExternalStore) ──────────────────────────────────────── */

const listeners = new Set<() => void>()
let cache: GuestCartLine[] = []
let cacheRaw = "[]"

function read(): GuestCartLine[] {
  if (typeof window === "undefined") return []
  const raw = window.localStorage.getItem(KEY) ?? "[]"
  if (raw === cacheRaw) return cache
  try {
    const parsed: unknown = JSON.parse(raw)
    cache = Array.isArray(parsed) ? (parsed as GuestCartLine[]) : []
  } catch {
    cache = []
  }
  cacheRaw = raw
  return cache
}

function write(next: GuestCartLine[]): void {
  cache = next
  cacheRaw = JSON.stringify(next)
  try {
    window.localStorage.setItem(KEY, cacheRaw)
  } catch {
    /* storage disabled — cart is best-effort */
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

export function addToCart(line: GuestCartLine): void {
  write(addLine(read(), line))
}
export function setCartQty(productId: string, quantity: number): void {
  write(setLineQty(read(), productId, quantity))
}
export function removeFromCart(productId: string): void {
  write(removeLine(read(), productId))
}
export function clearCart(): void {
  write([])
}

/**
 * A STABLE empty snapshot for SSR / the initial server render. It must be the same reference every
 * call — returning a fresh `[]` makes useSyncExternalStore think the snapshot changed and React warns
 * about (and can trip) an infinite loop.
 */
const EMPTY_CART: readonly GuestCartLine[] = []

/** Reactive cart lines. */
export function useCart(): GuestCartLine[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY_CART as GuestCartLine[])
}

/** Reactive cart count (the badge). */
export function useCartCount(): number {
  return cartCount(useCart())
}
