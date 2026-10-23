/**
 * Connectivity, and the guard that stops a write being reported as saved when it was not
 * .
 *
 * This is genuine client state, which is why it lives in a TanStack Store and not in the query
 * cache (Principle VI). "Is this device connected" is not something the server can tell us.
 */
// `@tanstack/react-store`, not `@tanstack/store`. It re-exports `Store` (`export * from
// "@tanstack/store"`), and react-store is what this app declares. Importing the core package
// directly worked only because it is a transitive dependency that `node-linker=hoisted` flattens
// into the root `node_modules` — an undeclared dependency that resolves by luck, and stops
// resolving the moment the hoisting layout changes. Every other store in this app imports it the
// same way.
import { Store } from "@tanstack/react-store"

export interface OnlineState {
  online: boolean
  /** When the console last completed a successful request. Null until the first one. */
  lastContactAt: number | null
}

export const onlineStore = new Store<OnlineState>({
  // Default true, not false. `navigator.onLine` is unavailable in some test environments and in
  // older browsers, and defaulting to offline would render the offline banner and refuse every
  // write on a perfectly connected console — a far worse failure than the reverse.
  online: typeof navigator === "undefined" ? true : (navigator.onLine ?? true),
  lastContactAt: null,
})

/**
 * Raised instead of sending a mutation while offline.
 *
 * A distinct type, so the UI can say "you are offline" rather than the generic failure it would
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
 * Refuse a write while offline; never queue it. A pick sent an hour late is a claim about a shelf another
 * operator may have emptied since, and nothing could settle the conflict. Call this at the top of every
 * mutation, before anything optimistic.
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

/** Record a failure that looks like connectivity: network-level only (a 500 reached the server). */
export function noteNetworkFailure(): void {
  onlineStore.setState((s) => ({ ...s, online: false }))
}

/**
 * Start tracking. Returns a teardown, and is safe to call where `window` does not exist.
 *
 * `onReconnect` is where the console refetches, so recovery needs no manual reload.
 */
export function watchConnectivity(onReconnect?: () => void): () => void {
  if (typeof window === "undefined") return () => undefined

  const goOnline = () => {
    const wasOffline = !onlineStore.state.online
    onlineStore.setState((s) => ({ ...s, online: true }))
    // Fire only on a transition. `online` fires on some platforms for events that are not a
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
