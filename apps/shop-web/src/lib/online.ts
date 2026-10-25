import { Store } from "@tanstack/react-store"

interface OnlineState {
  online: boolean
  lastContactAt: number | null
}

export const onlineStore = new Store<OnlineState>({
  online: typeof navigator === "undefined" ? true : (navigator.onLine ?? true),
  lastContactAt: null,
})

export class OfflineError extends Error {
  constructor() {
    super("You are offline. This change cannot be saved until the connection returns.")
    this.name = "OfflineError"
  }
}

export function isOffline(): boolean {
  return !onlineStore.state.online
}

export function assertOnline(): void {
  if (isOffline()) throw new OfflineError()
}

export function noteContact(): void {
  onlineStore.setState((s) => ({
    online: true,
    lastContactAt: Date.now(),
    ...(s.online ? {} : {}),
  }))
}

export function noteNetworkFailure(): void {
  onlineStore.setState((s) => ({ ...s, online: false }))
}

export function watchConnectivity(onReconnect?: () => void): () => void {
  if (typeof window === "undefined") return () => undefined

  const goOnline = () => {
    const wasOffline = !onlineStore.state.online
    onlineStore.setState((s) => ({ ...s, online: true }))
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
