/**
 * Installing the console onto a device (059, US2 / FR-001, FR-006, FR-007).
 *
 * Two mechanisms, because the two platforms that matter behave differently:
 *
 *   • Chromium (Android, desktop) fires `beforeinstallprompt`, which can be captured and replayed
 *     from a control of our own.
 *   • ⚠ iOS/iPadOS Safari fires NOTHING and exposes no install API at all. The only route is the
 *     operator finding Share → Add to Home Screen by themselves, so the console has to say so.
 *
 * ⚠ AND ON IPADOS THAT IS NOT A CONVENIENCE. The Push API is available ONLY to a home-screen web
 * app there. On this audience's primary device, an operator who never installs cannot even be ASKED
 * for notification permission — the API is absent. So these instructions are the precondition for
 * the whole of US1 on the device it matters most on, which is why US2 is P1.
 */
import { Store } from "@tanstack/store"

const DISMISSED_KEY = "effy-shop.install-dismissed"

/** The Chromium event, which TypeScript's DOM lib does not declare. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export type InstallMethod =
  /** Chromium — we hold a deferred prompt and can show it from our own button. */
  | "prompt"
  /** iOS/iPadOS Safari — no API; the operator does it by hand and we explain how. */
  | "ios-manual"
  /** Already installed, dismissed, or a browser that cannot install. Show nothing. */
  | "none"

export interface InstallState {
  method: InstallMethod
  /** True once the console is running from the home screen. */
  installed: boolean
}

export const installStore = new Store<InstallState>({ method: "none", installed: false })

let deferred: BeforeInstallPromptEvent | null = null

/** Running as an installed app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  // ⚠ TWO CHECKS, NOT ONE. `display-mode: standalone` is the standard; `navigator.standalone` is
  // Safari's own, non-standard and the ONLY reliable signal on older iOS. Checking just the first
  // makes an installed iPad look uninstalled, so the console would keep telling an operator to
  // install something they are already using.
  const byMedia = window.matchMedia?.("(display-mode: standalone)").matches ?? false
  const byApple = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return byMedia || byApple
}

/** iOS or iPadOS Safari, where installing is manual. */
export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  // ⚠ An iPad running iPadOS 13+ reports itself as a Mac. The touch-point check is what separates
  // it from a desktop; without it every shop iPad falls through to "cannot install" and no
  // instructions are ever shown — on the exact device that needs them.
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
  if (!iOS) return false
  // Chrome/Firefox/Edge on iOS are Safari underneath but cannot add to the home screen themselves.
  return !/CriOS|FxiOS|EdgiOS/.test(ua)
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1"
  } catch {
    // Private mode or blocked storage. Treat as not dismissed — the affordance is a courtesy and a
    // thrown read must never take the console down with it.
    return false
  }
}

/** Remember that the operator said no, so they are not asked again on every visit (FR-006). */
export function dismissInstall(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1")
  } catch {
    /* see above */
  }
  installStore.setState((s) => ({ ...s, method: "none" }))
}

/** Show the browser's own install prompt. Chromium only; resolves to whether it was accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  // ⚠ The event is single-use: a captured prompt cannot be replayed. Dropping the reference is what
  // stops a second click calling `prompt()` on a spent event, which throws.
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

/** Start listening. Idempotent enough to call once from the app entry. */
export function watchInstallability(): void {
  if (typeof window === "undefined") return

  installStore.setState(() => ({ method: resolveMethod(), installed: isStandalone() }))

  window.addEventListener("beforeinstallprompt", (event) => {
    // Chromium shows its own mini-infobar unless this is prevented; we want the control to sit
    // where the rest of the console's affordances are, not in browser chrome the operator ignores.
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    installStore.setState((s) => ({ ...s, method: resolveMethod() }))
  })

  window.addEventListener("appinstalled", () => {
    deferred = null
    installStore.setState(() => ({ method: "none", installed: true }))
  })
}
