/**
 * Device-local recently-viewed store (FR-004, FR-012). For a guest this lives ONLY on the device
 * (localStorage) — there is no server table (R12). Most-recent-first, capped.
 *
 * The ordering logic is a pure function so it is unit-testable without a DOM; the localStorage wrapper
 * is a thin edge that guards `typeof window` for SSR.
 */

const KEY = "effy:recently-viewed"
const MAX = 20

/** Pure core: prepend id, drop any prior occurrence, cap to MAX. Unit-tested. */
export function computeRecentlyViewed(existing: readonly string[], id: string): string[] {
  return [id, ...existing.filter((x) => x !== id)].slice(0, MAX)
}

/** Read the id list (most-recent-first). Safe on the server (returns []). */
export function getRecentlyViewedIds(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

/** Record a product view; returns the new list. No-op on the server. */
export function recordView(id: string): string[] {
  if (typeof window === "undefined") return []
  const next = computeRecentlyViewed(getRecentlyViewedIds(), id)
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // storage full / disabled — recently-viewed is best-effort, never fatal.
  }
  return next
}
