"use client"

/**
 * The device's mirror of which products are saved (033).
 *
 * ⚠ THIS IS THE FIX FOR THE DEFECT THE SLICE EXISTS FOR. Before it, nothing could answer "is this
 * product already saved?", so `FavoriteButton` opened with a hard-coded `useState(false)` and its own
 * comment admitted it. A shopper who saved something yesterday saw an empty heart today, tapped it (a
 * no-op PUT), tapped again — and silently un-saved the thing they were trying to save.
 *
 * Every control subscribes here rather than holding its own boolean, which is what stops two controls
 * for the same product on one screen from disagreeing (FR-013).
 *
 * Device-local and dependency-free, exactly like `cart-store.ts` and `delivery-store.ts` and for the
 * same reason: this is the only PUBLIC surface and its guest bundle has a measured byte budget, so no
 * TanStack, no Zustand — nothing but `useSyncExternalStore` over `localStorage`.
 *
 * ⚠ NOT a cookie. A cookie would be readable during server rendering, which sounds convenient and
 * would cost every public page its static shell.
 */
import { useSyncExternalStore } from "react"

const KEY = "effy:saved:v1"
const SCHEMA_VERSION = 1

/**
 * ⚠ No legacy key to migrate. The predecessor stored NOTHING client-side — a guest was bounced to
 * sign-in the moment they tapped — so `effy:saved:v1` starts clean. (Contrast `cart-store.ts`, where
 * dropping the legacy read would have made the deploy itself the cart-loss bug it was fixing.)
 */

interface Envelope {
  version: number
  productIds: readonly string[]
  /**
   * 068: the subset of `productIds` held in a NAMED list. A tap on one of these hearts opens the
   * list chooser instead of un-saving.
   *
   * ⚠⚠ OPTIONAL, INSIDE THE v1 ENVELOPE, AND `SCHEMA_VERSION` MUST NOT BE BUMPED FOR IT. A version
   * mismatch DISCARDS the envelope, and for a guest this envelope is the ONLY copy of what they
   * saved — bumping it would empty every guest's list on deploy. Absent reads as empty, which is the
   * safe direction: the heart sends an un-save and the platform refuses it (`409`).
   */
  namedIds?: readonly string[]
}

/**
 * ⚠ Frozen, and returned BY IDENTITY on every empty read. `useSyncExternalStore` compares snapshots
 * by reference; a fresh `[]` each call looks like a changed snapshot and React trips an infinite
 * render loop. `cart-store.ts` carries the same warning for the same reason.
 */
const EMPTY: readonly string[] = Object.freeze([])

const listeners = new Set<() => void>()
let cache: readonly string[] = EMPTY
let named: readonly string[] = EMPTY
let cacheRaw = ""

/**
 * ⚠ EVERY failure mode yields the EMPTY set rather than throwing. Losing the mirror is recoverable —
 * the next membership read repairs it — but a render crash is not, and a half-parsed set is worst of
 * all because the shopper would trust it.
 *
 * ⚠ Empty also means "unknown", and that asymmetry is deliberate (FR-022). A control that wrongly
 * shows UNSAVED costs one redundant, idempotent save. A control that wrongly shows SAVED invites the
 * destructive second tap this feature exists to eliminate.
 */
function read(): readonly string[] {
  if (typeof window === "undefined") return EMPTY
  const raw = window.localStorage.getItem(KEY)
  if (!raw) {
    named = EMPTY
    return EMPTY
  }
  if (raw === cacheRaw) return cache
  try {
    const parsed = JSON.parse(raw) as Envelope
    // A version mismatch DISCARDS rather than migrates.
    if (!parsed || parsed.version !== SCHEMA_VERSION || !Array.isArray(parsed.productIds)) return EMPTY
    cacheRaw = raw
    cache = Object.freeze(parsed.productIds.filter((id) => typeof id === "string"))
    const n = Array.isArray(parsed.namedIds) ? parsed.namedIds.filter((id) => typeof id === "string") : []
    named = n.length ? Object.freeze(n) : EMPTY
    return cache
  } catch {
    return EMPTY
  }
}

function write(next: readonly string[], nextNamed: readonly string[] = named) {
  cache = Object.freeze([...next])
  // A product that is no longer saved cannot be in a named list.
  const n = nextNamed.filter((id) => cache.includes(id))
  named = n.length ? Object.freeze(n) : EMPTY
  cacheRaw = JSON.stringify({
    version: SCHEMA_VERSION,
    productIds: cache,
    ...(named.length ? { namedIds: named } : {}),
  } satisfies Envelope)
  try {
    window.localStorage.setItem(KEY, cacheRaw)
  } catch {
    /* storage disabled — the mirror is best-effort, never load-bearing */
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // ⚠ Cheap cross-tab agreement, and the reason two tabs never disagree about a heart.
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

/* ── Reads ────────────────────────────────────────────────────────────────────────────────────── */

export function useSavedIds(): readonly string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY)
}

/** The non-hook read, for effects and event handlers — the same source, reached without React. */
export function readSavedIds(): readonly string[] {
  return read()
}

export function isSaved(productId: string): boolean {
  return read().includes(productId)
}

/** 068: whether a saved product is in a list the shopper named. Always false for a guest. */
export function isInNamedList(productId: string): boolean {
  read()
  return named.includes(productId)
}

/* ── Writes ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * Replace the mirror with the platform's answer.
 *
 * `namedIds` omitted means the answer did not say (the merge response, or a backend from before
 * 068), and what the mirror already knows is kept.
 */
export function adoptSaved(productIds: readonly string[], namedIds?: readonly string[]) {
  read()
  write(productIds, namedIds ?? named)
}

/** Apply an intent to the mirror immediately, before the platform is told (FR-012). */
export function applySaved(productId: string, saved: boolean) {
  const current = read()
  if (saved) {
    if (current.includes(productId)) return
    write([productId, ...current])
  } else {
    if (!current.includes(productId)) return
    write(current.filter((id) => id !== productId))
  }
}

/**
 * Sign-out: an account's saved items must not stay readable on this device (FR-031).
 *
 * ⚠ NOT YET WIRED ON WEB, AND THE REASON IS STRUCTURAL. Sign-out is a zero-JS route handler
 * (`app/(auth)/sign-out/route.ts`) reached by a plain HTML form — deliberately, so it costs the guest
 * bundle nothing and works with JavaScript disabled. No client code runs during it, so nothing can
 * call this.
 *
 * ⚠ `resetCart()` in `cart-store.ts` has the IDENTICAL unwired gap and has since 027, so this is a
 * pre-existing shape rather than something 033 introduced. Mobile does clear on sign-out
 * (`SessionManager.onSignedOut`), so the surfaces differ here — recorded in the parity register as a
 * carry-forward rather than claimed as parity.
 *
 * Fixing it properly means a landing-side hook after the sign-out redirect, which costs guest-path
 * bytes on routes currently sitting 0.3 KB from the budget. It belongs with whatever slice can afford
 * that, and it should fix the cart at the same time.
 */
export function resetSaved() {
  write(EMPTY, EMPTY)
}

/** Test seam, mirroring `__resetToasts()` in `toast-store.ts`. */
export function __resetSavedCache() {
  cache = EMPTY
  named = EMPTY
  cacheRaw = ""
}
