/**
 * FCM web push, from the console's side. Firebase is imported dynamically everywhere here, keeping it out
 * of the entry chunk for operators who never turn notifications on.
 *
 * `getToken` is always given our own registration: without it the SDK registers
 * `/firebase-messaging-sw.js` beside the Workbox worker (two workers on one scope), and the deployed app
 * reloads itself after every deploy. `__tests__/registration.test.ts` fails if the argument is dropped.
 */
import { config } from "@/lib/env"
import { getRegistration } from "@/lib/pwa"

/** Why web push is unavailable on this device, in terms an operator can act on. */
export type PushSupport =
  | { supported: true }
  /** iOS/iPadOS Safari in a tab: the Push API exists only for a home-screen app there. */
  | { supported: false; reason: "needs-install" }
  /** No service worker, no PushManager, or an insecure origin. */
  | { supported: false; reason: "unsupported-browser" }

/**
 * Can this device receive web push at all?
 *
 * Checked before anything is offered, because the two unsupported cases need opposite messages.
 * "Add the console to your home screen first" is actionable; "your browser cannot do this" is not,
 * and showing the wrong one teaches an operator either to give up or to hunt for a setting that
 * does not exist.
 */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return { supported: false, reason: "unsupported-browser" }

  const hasApi =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  if (hasApi) return { supported: true }

  // On iOS/iPadOS in a browser tab, `PushManager` is simply absent — there is no error to catch
  // and no permission to request. Installing to the home screen is the entire remedy, and on this
  // audience's primary device it is the only route to US1 existing at all.
  const ua = navigator.userAgent
  const iOS =
    /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true

  if (iOS && !standalone) return { supported: false, reason: "needs-install" }
  return { supported: false, reason: "unsupported-browser" }
}

/** The browser's current permission, without asking for it. */
export function permissionState(): NotificationPermission {
  if (typeof Notification === "undefined") return "denied"
  return Notification.permission
}

/**
 * Ask for permission.
 *
 * Call this only from a deliberate operator action. There is exactly one prompt per
 * browser per lifetime, and a denial is not recoverable in-app on any browser — after it, nothing
 * this slice builds can reach that person until they change a browser setting they will never find.
 * Spending the prompt before the operator knows what they are agreeing to is how a console loses
 * the ability to notify permanently.
 */
export async function requestPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied"
  return Notification.requestPermission()
}

/**
 * Obtain this browser's FCM registration token.
 *
 * Returns null when permission is not granted, when push is unsupported, or when the SDK cannot
 * produce a token. On iOS the token is sometimes not obtainable until Safari has been closed and
 * reopened after granting permission — a documented platform behaviour we cannot fix
 * from here, which is why the caller reports "not enabled yet" rather than an error.
 */
export async function obtainToken(): Promise<string | null> {
  if (!pushSupport().supported) return null
  if (permissionState() !== "granted") return null

  const registration = getRegistration()
  // No registration means no token — we do not fall through and let the SDK make its own. That
  // would silently create the second service worker this whole design exists to prevent.
  if (!registration) return null

  const [{ initializeApp, getApps }, { getMessaging, getToken, isSupported }] = await Promise.all([
    import("firebase/app"),
    import("firebase/messaging"),
  ])

  // The sdk's own capability check — stricter than ours and worth asking, but useless on its own:
  // it cannot tell us why, which is what `pushSupport` is for.
  if (!(await isSupported())) return null

  const fb = config.firebase()
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: fb.apiKey,
      projectId: fb.projectId,
      appId: fb.appId,
      messagingSenderId: fb.messagingSenderId,
    })

  try {
    const token = await getToken(getMessaging(app), {
      vapidKey: config.vapidPublicKey(),
      serviceWorkerRegistration: registration,
    })
    return token || null
  } catch {
    // A revoked subscription, a cleared site, a blocked push service. The operator is told the
    // device is not enabled; they can try again. Never a thrown error into the console.
    return null
  }
}

/**
 * Forget this browser's token with FCM.
 *
 * Best-effort: if it fails, the row is still deleted on our side and the worker's existing
 * dead-token pruning removes what remains on the next send.
 */
export async function forgetToken(): Promise<void> {
  try {
    const [{ getApps }, { deleteToken, getMessaging, isSupported }] = await Promise.all([
      import("firebase/app"),
      import("firebase/messaging"),
    ])
    const app = getApps()[0]
    if (!app || !(await isSupported())) return
    await deleteToken(getMessaging(app))
  } catch {
    /* see above */
  }
}
