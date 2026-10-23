"use client"

/**
 * The cart MIRROR — device-local, dependency-free (this storefront ships a deliberately tiny guest
 * bundle; no TanStack/Zustand here, and 027 adds no dependency either).
 *
 * ── What this is, since 027 ─────────────────────────────────────────────────────────────────────
 *
 * For a signed-in shopper the PLATFORM is authoritative (research R0, reversing 019's Option B). This
 * store is a non-authoritative mirror: updated synchronously so a tap lands immediately (FR-014) and the
 * badge is right without a round trip (FR-015), persisted so a closed tab does not lose the cart
 * (FR-001), and reconciled against the platform on open (see `cart-sync.ts`).
 *
 * Two rules keep it honest, and they are the whole design:
 *
 *  1. **[adopt] only ever moves forward.** A platform response is taken only when its `revision` exceeds
 *     what the mirror holds — otherwise a slow response to an old change, landing after a fast response
 *     to a new one, would resurrect a stale cart (FR-009 from the client side).
 *  2. **A local edit never invents money the platform has not confirmed.** It recomputes the item
 *     subtotal for display and DROPS any applied discount, because a discount not re-approved against
 *     the changed cart is a figure we would be making up (FR-042).
 *
 * The ordering/quantity/total logic is pure (unit-tested); the localStorage + useSyncExternalStore
 * wrapper is a thin client edge.
 */
import { useSyncExternalStore } from "react"

import type { CartDTO, UnitPriceDTO } from "@effy/shared-types"

import { computeCartTotals } from "./cart-totals"

/** ⚠ 098 — a line is a VARIANT (a size of a product), so the mirror is keyed by `variantId`. */
const KEY = "effy:cart:v3"
const SCHEMA_VERSION = 3
const MAX_QTY = 99

/**
 * The package a line falls into when the storefront read carries no opaque `packageKey` yet (021). It
 * puts everything into one anonymous package — a single-package cart, which degrades gracefully
 * (FR-007/SC-011). It is NOT a shop id; the authoritative per-shop split happens server-side at the
 * checkout quote.
 */
export const DEFAULT_PACKAGE_KEY = "pkg_default"

export interface GuestCartLine {
  /** 098 — the line's identity: the size being bought. */
  variantId: string
  /** The product it is a size of — for the link back to its page. */
  productId: string
  name: string
  /** 098 — the size's words ("1 kg"), null for a product sold one way. */
  variantLabel?: string | null
  /** 098 — the comparison price, when the platform gave one (never computed here). */
  unitPrice?: UnitPriceDTO | null
  imageUrl: string | null
  /** 086 — the picture's smaller copies, when the read that added the line said. */
  imageWidths?: number[]
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
  /**
   * 027 — whether the platform still considers this purchasable. An unavailable line stays visible and
   * flagged (a temporary state may be waited out) but contributes to NO total and cannot be paid for
   * (FR-022). Defaults true for a line added locally before the platform has spoken.
   */
  available?: boolean
  /**
   * 027 — the price this line was added at, when the platform reports it differs from the current one
   * (FR-023). Null/absent means there is no change to report. The shopper always pays `unitPriceAmount`.
   */
  priceChangedFrom?: string | null
}

/** An anonymous package section for the cart split — the items, and an opaque key. NEVER a shop. */
export interface CartPackage {
  packageKey: string
  lines: GuestCartLine[]
}

/* ── Pure core (unit-tested) ─────────────────────────────────────────────────────────────────── */

/** Add or increment a line, clamping quantity to the max. */
export function addLine(lines: readonly GuestCartLine[], line: GuestCartLine): GuestCartLine[] {
  const existing = lines.find((l) => l.variantId === line.variantId)
  if (existing) {
    return lines.map((l) =>
      l.variantId === line.variantId
        ? { ...l, quantity: Math.min(l.quantity + line.quantity, MAX_QTY) }
        : l,
    )
  }
  return [...lines, { ...line, quantity: Math.min(Math.max(line.quantity, 1), MAX_QTY) }]
}

/** Set a line's quantity; 0 or less removes it. */
export function setLineQty(
  lines: readonly GuestCartLine[],
  variantId: string,
  quantity: number,
): GuestCartLine[] {
  if (quantity <= 0) return lines.filter((l) => l.variantId !== variantId)
  return lines.map((l) =>
    l.variantId === variantId ? { ...l, quantity: Math.min(quantity, MAX_QTY) } : l,
  )
}

export function removeLine(lines: readonly GuestCartLine[], variantId: string): GuestCartLine[] {
  return lines.filter((l) => l.variantId !== variantId)
}

/** Total item count (sum of quantities) — the cart badge. */
export function cartCount(lines: readonly GuestCartLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0)
}

/**
 * The line payload the platform accepts (merge, preview). Renamed from 019's `replacePayload`: there is
 * no replace any more, and a name promising one would outlive the operation it described.
 */
export function linePayload(lines: readonly GuestCartLine[]): { variantId: string; quantity: number }[] {
  return lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }))
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

/* ── The mirror ──────────────────────────────────────────────────────────────────────────────── */

/** The whole cart as the app holds it — the shape persisted and rendered. */
export interface CartMirror {
  /** Monotonic, from the platform. The mirror adopts a response only when this is not older. */
  revision: number
  lines: GuestCartLine[]
  /** Set aside for later: kept, shown honestly, counted in NO total (FR-028…FR-031). */
  savedLines: GuestCartLine[]
  itemSubtotalAmount: string
  discountAmount: string
  grandTotalAmount: string
  currency: string
  notices: CartDTO["notices"]
  discount: CartDTO["discount"]
  /** 094 — every promotion applying, and the ones that do not yet, with why. */
  promotions?: CartDTO["promotions"]
  promotionsNotApplied?: CartDTO["promotionsNotApplied"]
  checkout: CartDTO["checkout"]
  limits: CartDTO["limits"]
}

/**
 * A STABLE empty mirror for SSR / the initial server render. It must be the same reference every call —
 * a fresh object makes useSyncExternalStore think the snapshot changed, and React warns about (and can
 * trip) an infinite render loop.
 */
export const EMPTY_MIRROR: CartMirror = Object.freeze({
  revision: 0,
  lines: [],
  savedLines: [],
  itemSubtotalAmount: "0.00",
  discountAmount: "0.00",
  grandTotalAmount: "0.00",
  currency: "AUD",
  notices: [],
  discount: null,
  checkout: { allowed: false, blockedReason: "empty", minimumSubtotalAmount: null, remainingAmount: null },
  limits: { maxLineQuantity: MAX_QTY, maxDistinctItems: 100 },
}) as CartMirror

interface Envelope {
  version: number
  cart: CartMirror
}

/* ── Client store (localStorage + useSyncExternalStore) ──────────────────────────────────────── */

const listeners = new Set<() => void>()
let cache: CartMirror = EMPTY_MIRROR
let cacheRaw = ""

/**
 * Read the mirror. Every failure mode — no blob, an unknown version, unparseable JSON — yields the EMPTY
 * mirror rather than throwing: losing a cart is bad, but a render crash is worse, and a half-parsed cart
 * is worst because the shopper would trust it.
 */
function read(): CartMirror {
  if (typeof window === "undefined") return EMPTY_MIRROR
  const raw = window.localStorage.getItem(KEY)
  if (raw === null) return EMPTY_MIRROR
  if (raw === cacheRaw) return cache
  try {
    const parsed = JSON.parse(raw) as Envelope
    cache = parsed?.version === SCHEMA_VERSION && parsed.cart ? parsed.cart : EMPTY_MIRROR
  } catch {
    cache = EMPTY_MIRROR
  }
  cacheRaw = raw
  return cache
}

function write(next: CartMirror): void {
  cache = next
  cacheRaw = JSON.stringify({ version: SCHEMA_VERSION, cart: next } satisfies Envelope)
  try {
    window.localStorage.setItem(KEY, cacheRaw)
  } catch {
    /* storage disabled — cart is best-effort */
  }
  listeners.forEach((l) => l())
}

/**
 * Recompute what a local edit can honestly know: the item subtotal (excluding anything unavailable —
 * FR-022), the total, and whether checkout is worth offering. Everything else is the platform's.
 */
function recompute(cart: CartMirror): CartMirror {
  const payable = cart.lines.filter((l) => l.available !== false)
  const subtotal = computeCartTotals(payable).itemSubtotal
  return {
    ...cart,
    itemSubtotalAmount: subtotal,
    // A discount the platform has not re-approved against THIS cart is a number we would invent.
    discount: null,
    discountAmount: "0.00",
    grandTotalAmount: subtotal,
    checkout: {
      ...cart.checkout,
      allowed: payable.length > 0 && cart.checkout.blockedReason !== "below_minimum",
      blockedReason:
        cart.lines.length === 0
          ? "empty"
          : payable.length === 0
            ? "no_payable_items"
            : // A local edit cannot re-judge the minimum: it is the platform's number, and the platform
              // re-answers on the next response. Leave whatever it last said.
              cart.checkout.blockedReason === "below_minimum"
              ? "below_minimum"
              : null,
    },
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // Another TAB of the same browser changed the cart. Cheap cross-tab agreement, and the reason two tabs
  // do not silently disagree about what is in the cart.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cacheRaw = ""
      listener()
    }
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

/* ── Local edits ─────────────────────────────────────────────────────────────────────────────── */

export function addToCart(line: GuestCartLine): void {
  const cart = read()
  write(recompute({ ...cart, lines: addLine(cart.lines, line) }))
}

export function setCartQty(variantId: string, quantity: number): void {
  const cart = read()
  write(recompute({ ...cart, lines: setLineQty(cart.lines, variantId, quantity) }))
}

export function removeFromCart(variantId: string): void {
  const cart = read()
  write(recompute({ ...cart, lines: removeLine(cart.lines, variantId) }))
}

/** Empty the payable cart. Set-aside items survive, exactly as on the platform (FR-030). */
export function clearCart(): void {
  const cart = read()
  write(recompute({ ...cart, lines: [] }))
}

/* ── Reconciliation with the platform ────────────────────────────────────────────────────────── */

/**
 * Take the platform's cart — but ONLY when it is not older than what we hold. Returns false when an
 * out-of-order response was correctly ignored, which is the entire reason `revision` exists.
 */
export function adopt(dto: CartDTO): boolean {
  if (dto.revision < read().revision) return false
  write(fromDTO(dto))
  return true
}

/**
 * Take a re-priced GUEST cart. A guest has no server cart, so `/v1/cart/preview` answers with revision 0
 * and `adopt`'s forward-only rule would reject it against any non-zero mirror — and then FR-004 would
 * silently fail for every guest. The platform's prices still win; the mirror keeps its own revision.
 */
export function adoptPreview(dto: CartDTO): void {
  write({ ...fromDTO(dto), revision: read().revision })
}

/** Back to an empty cart. Sign-out: an account's cart must not stay in this browser (FR-013). */
export function resetCart(): void {
  write(EMPTY_MIRROR)
}

function fromDTO(dto: CartDTO): CartMirror {
  const line = (l: CartDTO["lines"][number]): GuestCartLine => ({
    variantId: l.variantId,
    productId: l.productId,
    name: l.name,
    variantLabel: l.variantLabel,
    unitPrice: l.unitPrice ?? null,
    imageUrl: l.imageUrl,
    ...(l.imageWidths?.length ? { imageWidths: l.imageWidths } : {}),
    unitPriceAmount: l.unitPriceAmount,
    currency: dto.currency,
    quantity: l.quantity,
    packageKey: l.packageKey || DEFAULT_PACKAGE_KEY,
    available: l.available,
    priceChangedFrom: l.priceChangedFrom ?? null,
  })
  return {
    revision: dto.revision,
    lines: dto.lines.map(line),
    savedLines: dto.savedLines.map(line),
    itemSubtotalAmount: dto.itemSubtotalAmount,
    discountAmount: dto.discountAmount,
    grandTotalAmount: dto.grandTotalAmount,
    currency: dto.currency,
    notices: dto.notices,
    discount: dto.discount,
    promotions: dto.promotions,
    promotionsNotApplied: dto.promotionsNotApplied ?? [],
    checkout: dto.checkout,
    limits: dto.limits,
  }
}

/**
 * The current mirror, WITHOUT a hook — for code that runs in an effect or an event handler rather than
 * during render (the sync coordinator). The store's read is synchronous, so this is not a second source of
 * truth; it is the same one, reached without React.
 */
export function readCart(): CartMirror {
  return read()
}

/* ── Hooks ───────────────────────────────────────────────────────────────────────────────────── */

/** The whole mirror, reactively. */
export function useCartMirror(): CartMirror {
  return useSyncExternalStore(subscribe, read, () => EMPTY_MIRROR)
}

/** Reactive cart lines (the common case). */
export function useCart(): GuestCartLine[] {
  return useCartMirror().lines
}

/** Reactive cart count (the badge) — local, so it never waits on a network round trip (FR-015). */
export function useCartCount(): number {
  return cartCount(useCartMirror().lines)
}
