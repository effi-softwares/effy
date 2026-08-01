"use client"

/**
 * The delivery context — where the shopper wants their order delivered (025 US1 / FR-012, FR-013).
 *
 * The storefront's biggest gap before this: a shopper could browse the whole catalogue, fill a cart,
 * sign in, and only THEN discover Effy does not deliver to them. The platform has known delivery zones
 * — it simply never told anyone until checkout. This holds the answer from the first page.
 *
 * Device-local and dependency-free, exactly like `cart-store.ts` and for the same reason: this is the
 * only PUBLIC surface and its guest bundle has a measured byte budget, so no TanStack, no Zustand,
 * nothing but `useSyncExternalStore` over `localStorage`.
 *
 * ⚠ It deliberately does NOT live in a cookie. A cookie would be readable during server rendering,
 * which sounds convenient and would cost every public page its static shell — the exact failure the
 * warning at the top of `app/(shop)/layout.tsx` describes.
 *
 * ⚠ It is NEVER written back to the account. A guest's location is a device preference; it becomes an
 * address only through the normal address-book flow.
 */
import { useSyncExternalStore } from "react"

const KEY = "effy:delivery"

/** How the stored location was arrived at. Display provenance only — never an authorization input. */
export type DeliverySource = "guest" | "account"

export interface DeliveryContext {
  /** Normalised to exactly 4 digits (AU) — the same form the server stores and compares. */
  postcode: string
  /**
   * The locality the shopper picked, e.g. "Richmond" (030 FR-033).
   *
   * ⚠ OPTIONAL, and absent is meaningful: it means the shopper typed a bare postcode, or the place
   * lookup could not resolve one. In that case the display shows the postcode WITHOUT inventing a
   * suburb (FR-034) — a postcode covering several localities has no single right answer, and
   * choosing one asserts a decision the shopper never made.
   */
  locality?: string | null
  /** The state/territory, e.g. "VIC". Absent for the same reasons as `locality`. */
  state?: string | null
  /**
   * Whether Effy delivers to `postcode`.
   *
   * ⚠ Only ever the answer FOR THE STORED POSTCODE. Changing the postcode invalidates it, so there is
   * no window in which the UI shows a stale "yes" for a new location. `null` means "we haven't got an
   * answer" — which is NOT the same as "no", and the UI must not render it as one.
   */
  serviced: boolean | null
  /** When the answer was obtained (epoch ms). For staleness decisions, never for display. */
  checkedAt: number
  source: DeliverySource
}

/* ── Pure core (unit-tested) ─────────────────────────────────────────────────────────────────── */

/**
 * Reduce caller input to the canonical stored form, or reject it.
 *
 * Mirrors `delivery.NormalizePostcode` on the hot path. Both must agree, because a postcode the client
 * accepts and the server rejects produces a confusing 400 the shopper cannot act on.
 */
export function normalizePostcode(raw: string): string | null {
  const trimmed = raw.trim()
  // Separators are tolerated only BETWEEN digits ("30 00", "30-00"). A leading or trailing one is not
  // a typo to forgive — without this, "-1000" strips to "1000" and a shopper is silently told about a
  // postcode they did not enter.
  if (!/^\d[\d\s-]*\d$/.test(trimmed)) return null
  const stripped = trimmed.replace(/[\s-]/g, "")
  return /^\d{4}$/.test(stripped) ? stripped : null
}

/**
 * Fold a fresh serviceability answer into the context.
 *
 * If the answer arrived for a DIFFERENT postcode than the one now stored, it is discarded — an
 * in-flight request for a postcode the shopper has already changed away from must never overwrite the
 * current one. (Type "3000", start a request, correct it to "3001": the slow 3000 response must not
 * land on 3001.)
 */
export function applyAnswer(
  current: DeliveryContext | null,
  postcode: string,
  serviced: boolean,
  now: number,
): DeliveryContext | null {
  if (!current || current.postcode !== postcode) return current
  return { ...current, serviced, checkedAt: now }
}

/* ── Client store (localStorage + useSyncExternalStore) ──────────────────────────────────────── */

const listeners = new Set<() => void>()
let cache: DeliveryContext | null = null
let cacheRaw = "null"

function read(): DeliveryContext | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(KEY) ?? "null"
  if (raw === cacheRaw) return cache
  try {
    const parsed: unknown = JSON.parse(raw)
    cache =
      parsed && typeof parsed === "object" && typeof (parsed as DeliveryContext).postcode === "string"
        ? (parsed as DeliveryContext)
        : null
  } catch {
    cache = null
  }
  cacheRaw = raw
  return cache
}

function write(next: DeliveryContext | null): void {
  cache = next
  cacheRaw = JSON.stringify(next)
  try {
    window.localStorage.setItem(KEY, cacheRaw)
  } catch {
    /* storage disabled — the delivery context is best-effort, never load-bearing */
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Read the delivery context reactively. `null` until the shopper sets one. */
export function useDeliveryContext(): DeliveryContext | null {
  return useSyncExternalStore(subscribe, read, () => null)
}

/**
 * Set the location and ask the server whether Effy delivers there.
 *
 * The postcode is stored immediately with `serviced: null` so the UI can show "checking…" rather than
 * flickering through a wrong answer. Returns the normalised postcode, or null if the input was not a
 * postcode at all.
 */
export function setDeliveryPostcode(raw: string, source: DeliverySource = "guest"): string | null {
  const postcode = normalizePostcode(raw)
  if (!postcode) return null
  // ⚠ locality/state are cleared with the verdict. Showing the PREVIOUS place's name beside a new
  // postcode is worse than showing no name at all.
  write({ postcode, serviced: null, checkedAt: 0, source })
  return postcode
}

/**
 * Set the location from a place the shopper CHOSE (030 FR-005) — so we know its name, not just its
 * digits.
 *
 * Distinct from `setDeliveryPostcode` because the shopper picked this from a list: the name is
 * theirs, not a guess, and FR-033 says the display should use it.
 */
export function setDeliveryPlace(
  place: { locality: string; state: string; postcode: string },
  source: DeliverySource = "guest",
): string | null {
  const postcode = normalizePostcode(place.postcode)
  if (!postcode) return null
  write({ postcode, locality: place.locality, state: place.state, serviced: null, checkedAt: 0, source })
  return postcode
}

/** Record an answer from the server, ignoring it if the shopper has since changed the postcode. */
export function recordServiceability(postcode: string, serviced: boolean): void {
  const next = applyAnswer(read(), postcode, serviced, Date.now())
  if (next) write(next)
}

/** Forget the location entirely (the "change" flow's clear action). */
export function clearDeliveryContext(): void {
  write(null)
}

/**
 * Seed from the signed-in shopper's default address, but only when the device has no location yet.
 *
 * A shopper who deliberately set a different postcode on this device keeps it — their explicit choice
 * outranks their saved default.
 */
export function seedFromAccount(place: {
  postcode: string
  locality?: string | null
  state?: string | null
}): void {
  if (read()) return
  const postcode = normalizePostcode(place.postcode)
  if (!postcode) return
  write({
    postcode,
    locality: place.locality ?? null,
    state: place.state ?? null,
    serviced: null,
    checkedAt: 0,
    source: "account",
  })
}

/**
 * Drop an ACCOUNT-derived location on sign-out; keep one the shopper set themselves (030 FR-023).
 *
 * ⚠ `source` was display provenance in 025. This is what makes it load-bearing: a place taken from
 * someone's account must not outlive the session that produced it, because the device may not be
 * theirs alone. A place they typed on this device is their own preference and survives.
 */
export function clearAccountDeliveryContext(): void {
  const current = read()
  if (current?.source === "account") write(null)
}
