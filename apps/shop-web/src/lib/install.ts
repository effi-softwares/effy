import { Store } from "@tanstack/react-store"

const DISMISSED_KEY = "effy-shop.install-dismissed"

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

type InstallMethod = "prompt" | "ios-manual" | "none"

interface InstallState {
  method: InstallMethod
  installed: boolean
}

export const installStore = new Store<InstallState>({ method: "none", installed: false })

let deferred: BeforeInstallPromptEvent | null = null

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  const byMedia = window.matchMedia?.("(display-mode: standalone)").matches ?? false
  const byApple = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return byMedia || byApple
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
  if (!iOS) return false
  return !/CriOS|FxiOS|EdgiOS/.test(ua)
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1"
  } catch {
    return false
  }
}

export function dismissInstall(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1")
  } catch {}
  installStore.setState((s) => ({ ...s, method: "none" }))
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  if (outcome === "accepted") {
    installStore.setState((s) => ({ ...s, method: "none" }))
    return true
  }
  return false
}

function resolveMethod(): InstallMethod {
  if (isStandalone() || dismissed()) return "none"
  if (deferred) return "prompt"
  if (isIosSafari()) return "ios-manual"
  return "none"
}

export function watchInstallability(): void {
  if (typeof window === "undefined") return

  installStore.setState(() => ({ method: resolveMethod(), installed: isStandalone() }))

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    installStore.setState((s) => ({ ...s, method: resolveMethod() }))
  })

  window.addEventListener("appinstalled", () => {
    deferred = null
    installStore.setState(() => ({ method: "none", installed: true }))
  })
}
