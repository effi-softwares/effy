/**
 * Connectivity, and the guard that stops a write being reported as saved when it was not
 * (059, US5 / FR-033, FR-036, FR-037).
 *
 * ⚠ THIS IS GENUINE CLIENT STATE, which is why it lives in a TanStack Store and not in the query
 * cache (Principle VI). "Is this device connected" is not something the server can tell us.
 */
import { Store } from "@tanstack/store"

export interface OnlineState {
  online: boolean
  /** When the console last completed a successful request. Null until the first one. */
  lastContactAt: number | null
}

export const onlineStore = new Store<OnlineState>({
  // ⚠ Default TRUE, not false. `navigator.onLine` is unavailable in some test environments and in
  // older browsers, and defaulting to offline would render the offline banner and refuse every
  // write on a perfectly connected console — a far worse failure than the reverse.
  online: typeof navigator === "undefined" ? true : (navigator.onLine ?? true),
  lastContactAt: null,
})

/**
 * Raised instead of sending a mutation while offline (FR-036).
 *
 * ⚠ A DISTINCT TYPE, so the UI can say "you are offline" rather than the generic failure it would
 * otherwise show. "Told it cannot be done right now" and "appeared to work and quietly did nothing"
 * look identical to an operator for about two seconds, and only one of them is honest.
 */
export class OfflineError extends Error {
  constructor() {
    super("You are offline. This change cannot be saved until the connection returns.")
    this.name = "OfflineError"
  }
}

export function isOffline(): boolean {
  return !onlineStore.state.online
}

/**
 * Refuse a write while offline.
 *
 * ⚠ REFUSES; IT DOES NOT QUEUE, and that is a requirement rather than a limitation (spec Decisions
 * taken, 2026-09-19). A pick recorded on a tablet and sent an hour later is a claim about a shelf
 * ANOTHER OPERATOR MAY HAVE EMPTIED in between, and the platform has no conflict rule that could
 * settle it. 054 already accepts a residual oversell window it cannot close; a replayed pick would
 * widen it invisibly.
 *
 * Call this at the top of every mutation function, before anything optimistic happens.
 */
export function assertOnline(): void {
  if (isOffline()) throw new OfflineError()
}

/** Record that a request succeeded — evidence of connectivity stronger than `navigator.onLine`. */
export function noteContact(): void {
  onlineStore.setState((s) => ({
    online: true,
    lastContactAt: Date.now(),
    ...(s.online ? {} : {}),
  }))
}

/**
 * Record that a request failed for a reason that looks like connectivity.
 *
 * ⚠ ONLY a network-level failure. An HTTP 500 means we reached the server, so treating it as
 * offline would tell an operator to check their wifi over a backend defect.
 */
export function noteNetworkFailure(): void {
  onlineStore.setState((s) => ({ ...s, online: false }))
}

/**
 * Start tracking. Returns a teardown, and is safe to call where `window` does not exist.
 *
 * `onReconnect` is where the console refetches (FR-037), so recovery needs no manual reload.
 */
export function watchConnectivity(onReconnect?: () => void): () => void {
  if (typeof window === "undefined") return () => undefined

  const goOnline = () => {
    const wasOffline = !onlineStore.state.online
    onlineStore.setState((s) => ({ ...s, online: true }))
    // ⚠ Fire only on a TRANSITION. `online` fires on some platforms for events that are not a
    // recovery, and refetching every screen each time is a burst of requests for nothing.
    if (wasOffline) onReconnect?.()
  }
  const goOffline = () => onlineStore.setState((s) => ({ ...s, online: false }))

  window.addEventListener("online", goOnline)
  window.addEventListener("offline", goOffline)

  return () => {
    window.removeEventListener("online", goOnline)
    window.removeEventListener("offline", goOffline)
  }
}
