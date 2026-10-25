import { Store } from "@tanstack/react-store"

const UPDATE_CHECK_MS = 30 * 60 * 1000

interface PwaState {
  updateReady: boolean
}

export const pwaStore = new Store<PwaState>({ updateReady: false })

let registration: ServiceWorkerRegistration | null = null

export function applyUpdate(): void {
  const waiting = registration?.waiting
  if (!waiting) return
  waiting.postMessage({ type: "SKIP_WAITING" })
}

// The one place the service worker is registered (shop-web's 059 shape, without push).
export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
  if (import.meta.env.DEV) return

  let reloading = false
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })

  // Classic, matching the iife build in vite.config.ts.
  void navigator.serviceWorker
    .register("/sw.js", { type: "classic" })
    .then((reg) => {
      registration = reg

      const track = (worker: ServiceWorker | null) => {
        if (!worker) return
        const update = () => {
          // A controller means this is an update, not the first install.
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            pwaStore.setState(() => ({ updateReady: true }))
          }
        }
        update()
        worker.addEventListener("statechange", update)
      }

      track(reg.waiting)
      reg.addEventListener("updatefound", () => track(reg.installing))

      const check = () => void reg.update().catch(() => undefined)
      window.addEventListener("focus", check)
      setInterval(check, UPDATE_CHECK_MS)
    })
    .catch(() => {})
}
