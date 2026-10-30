"use client"

/**
 * The device's mirror of which products are saved. Every control subscribes here rather than holding its
 * own boolean, so two hearts for one product agree, and a saved product shows as saved. Device-local and
 * dependency-free like `cart-store.ts` (the guest bundle's budget); not a cookie, which server rendering
 * would read and so cost every public page its static shell.
 */
import { useSyncExternalStore } from "react"

const KEY = "effy:saved:v1"
const SCHEMA_VERSION = 1

/**
 * No legacy key to migrate. The predecessor stored nothing client-side - a guest was bounced to
 * sign-in the moment they tapped - so `effy:saved:v1` starts clean. (Contrast `cart-store.ts`, where
 * dropping the legacy read would have made the deploy itself the cart-loss bug it was fixing.)
 */

interface Envelope {
  version: number
  productIds: readonly string[]
  /**
   * The subset of `productIds` held in a named list. A tap on one of these hearts opens the
   * list chooser instead of un-saving.
   *
   * Optional, inside the v1 envelope, and `SCHEMA_VERSION` must not be bumped for it. A version
   * mismatch discards the envelope, and for a guest this envelope is the only copy of what they
   * saved - bumping it would empty every guest's list on deploy. Absent reads as empty, which is the
   * safe direction: the heart sends an un-save and the platform refuses it (`409`).
   */
  namedIds?: readonly string[]
}

/**
 * Frozen, and returned by identity on every empty read. `useSyncExternalStore` compares snapshots
 * by reference; a fresh `[]` each call looks like a changed snapshot and React trips an infinite
 * render loop. `cart-store.ts` carries the same warning for the same reason.
 */
const EMPTY: readonly string[] = Object.freeze([])

const listeners = new Set<() => void>()
let cache: readonly string[] = EMPTY
let named: readonly string[] = EMPTY
let cacheRaw = ""

/**
 * Every failure mode yields the empty set rather than throwing. Losing the mirror is recoverable
 * the next membership read repairs it - but a render crash is not, and a half-parsed set is worst of
 * all because the shopper would trust it.
 *
 * Empty also means "unknown", and that asymmetry is deliberate. A control that wrongly
 * shows unsaved costs one redundant, idempotent save. A control that wrongly shows saved invites the
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
    // A version mismatch discards rather than migrates.
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
    /* storage disabled - the mirror is best-effort, never load-bearing */
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Cheap cross-tab agreement, and the reason two tabs never disagree about a heart.
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

/* Reads */

export function useSavedIds(): readonly string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY)
}

/** The non-hook read, for effects and event handlers - the same source, reached without React. */
export function readSavedIds(): readonly string[] {
  return read()
}

export function isSaved(productId: string): boolean {
  return read().includes(productId)
}

/** Whether a saved product is in a list the shopper named. Always false for a guest. */
export function isInNamedList(productId: string): boolean {
  read()
  return named.includes(productId)
}

/* Writes */

/** Replace the mirror with the platform's answer. With `namedIds` omitted (the merge response), what the mirror knows is kept. */
export function adoptSaved(productIds: readonly string[], namedIds?: readonly string[]) {
  read()
  write(productIds, namedIds ?? named)
}

/** Apply an intent to the mirror immediately, before the platform is told. */
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
 * Sign-out: an account's saved items must not stay readable on this device. Not wired on web: sign-out is
 * a zero-JS route handler reached by a plain form, so no client code runs during it. `resetCart` has the
 * same gap; fixing both needs a landing-side hook after the redirect, which costs guest-path bytes.
 */
export function resetSaved() {
  write(EMPTY, EMPTY)
}

/** Test seam, mirroring `__resetToasts` in `toast-store.ts`. */
export function __resetSavedCache() {
  cache = EMPTY
  named = EMPTY
  cacheRaw = ""
}
