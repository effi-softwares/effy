/**
 * Service-worker registration, the update handshake, and the bridge the worker talks to the app
 * through (059, US2 / FR-009…FR-011).
 *
 * ⚠ THIS IS THE ONLY PLACE THAT REGISTERS A SERVICE WORKER, and `src/lib/__tests__/pwa.test.ts`
 * asserts that. The Firebase messaging SDK registers its own `/firebase-messaging-sw.js` unless it
 * is handed a registration — beside a Workbox worker that is two workers on one scope, whose
 * documented symptom is the app reloading itself continuously after every deploy. `getRegistration()`
 * below is what `messaging.ts` passes to `getToken`.
 */
// ⚠ `@tanstack/react-store`, NOT `@tanstack/store`. It re-exports `Store` (`export * from
// "@tanstack/store"`), and react-store is what this app DECLARES. Importing the core package
// directly worked only because it is a transitive dependency that `node-linker=hoisted` flattens
// into the root `node_modules` — an undeclared dependency that resolves by luck, and stops
// resolving the moment the hoisting layout changes. Every other store in this app imports it the
// same way.
import { Store } from "@tanstack/react-store"

/** How often an already-open console checks for a new build. */
const UPDATE_CHECK_MS = 30 * 60 * 1000

export interface PwaState {
  /** A new version is installed and waiting for the operator to accept it. */
  updateReady: boolean
  /** The console is running from a service worker (so offline support is live). */
  ready: boolean
}

export const pwaStore = new Store<PwaState>({ updateReady: false, ready: false })

let registration: ServiceWorkerRegistration | null = null
let navigateHandler: ((path: string) => void) | null = null

/** The single registration, for `getToken({ serviceWorkerRegistration })`. */
export function getRegistration(): ServiceWorkerRegistration | null {
  return registration
}

/**
 * Where a notification click should take the operator.
 *
 * The service worker cannot route a SPA, so it posts the path here and the app's router handles it.
 * ⚠ Deliberately NOT `client.navigate()` in the worker: that is a full document load, which throws
 * away the Query cache and the operator's place in whatever they were doing.
 */
export function onServiceWorkerNavigate(handler: (path: string) => void): () => void {
  navigateHandler = handler
  return () => {
    if (navigateHandler === handler) navigateHandler = null
  }
}

/** Accept a waiting update. The worker takes over and the page reloads once it does. */
export function applyUpdate(): void {
  const waiting = registration?.waiting
  if (!waiting) return
  // The page reloads on controllerchange, below — not here, or it reloads before the new worker has
  // actually taken control and the operator gets the old version again.
  waiting.postMessage({ type: "SKIP_WAITING" })
}

/**
 * Register the service worker and keep the update state current.
 *
 * Safe to call when service workers are unavailable (an old browser, a private window, an insecure
 * origin): it no-ops, and the console works exactly as it did before 059.
 */
export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
  // Dev runs without a service worker (see vite.config.ts devOptions) — registering the built path
  // there would 404 and log an error on every load.
  if (import.meta.env.DEV) return

  navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as { type?: string; path?: string } | null
    if (data?.type === "NAVIGATE" && typeof data.path === "string") {
      navigateHandler?.(data.path)
    }
  })

  // ⚠ Reload only ONCE, and only after the new worker actually controls the page. Without the guard
  // a browser that fires controllerchange more than once puts the console into a reload loop, which
  // on a shop tablet is indistinguishable from a crash.
  let reloading = false
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })

  void navigator.serviceWorker
    .register("/sw.js", { type: "classic" })
    .then((reg) => {
      registration = reg
      pwaStore.setState((s) => ({ ...s, ready: true }))

      const track = (worker: ServiceWorker | null) => {
        if (!worker) return
        const update = () => {
          // `installed` with an existing controller means a NEW version is waiting. Without a
          // controller it is the first install, which is not an update and must not prompt.
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            pwaStore.setState((s) => ({ ...s, updateReady: true }))
          }
        }
        update()
        worker.addEventListener("statechange", update)
      }

      track(reg.waiting)
      reg.addEventListener("updatefound", () => track(reg.installing))

      // ⚠ A CONSOLE OPEN ALL SHIFT NEVER NAVIGATES, so nothing would ever ask for an update and a
      // deployed fix could sit waiting indefinitely — SC-009 fails on precisely the device that
      // never closes the app. Check on focus, and on a timer for the tablet that is never touched.
      const check = () => void reg.update().catch(() => undefined)
      window.addEventListener("focus", check)
      setInterval(check, UPDATE_CHECK_MS)
    })
    .catch(() => {
      // A failed registration must never break the console. Offline support and notifications are
      // simply absent; everything else works exactly as it did before 059.
    })
}
