import { Store } from "@tanstack/react-store"

const UPDATE_CHECK_MS = 30 * 60 * 1000

interface PwaState {
  updateReady: boolean
  ready: boolean
}

export const pwaStore = new Store<PwaState>({ updateReady: false, ready: false })

let registration: ServiceWorkerRegistration | null = null
let navigateHandler: ((path: string) => void) | null = null

export function getRegistration(): ServiceWorkerRegistration | null {
  return registration
}

export function onServiceWorkerNavigate(handler: (path: string) => void): () => void {
  navigateHandler = handler
  return () => {
    if (navigateHandler === handler) navigateHandler = null
  }
}

export function applyUpdate(): void {
  const waiting = registration?.waiting
  if (!waiting) return
  waiting.postMessage({ type: "SKIP_WAITING" })
}

export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
  if (import.meta.env.DEV) return

  navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as { type?: string; path?: string } | null
    if (data?.type === "NAVIGATE" && typeof data.path === "string") {
      navigateHandler?.(data.path)
    }
  })

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
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            pwaStore.setState((s) => ({ ...s, updateReady: true }))
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
