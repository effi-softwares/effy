/**
 * FCM web push, from the console's side (059, US1).
 *
 * ⚠ FIREBASE IS DYNAMICALLY IMPORTED, EVERYWHERE IN THIS FILE. `firebase/app` + `firebase/messaging`
 * are not small, and the one screen an operator waits on is sign-in. A static import would put them
 * in the entry chunk, where they would be downloaded by every operator on every cold load —
 * including the ones who never turn notifications on (SC-012 says those operators should see no
 * change at all).
 *
 * ⚠ `getToken` IS ALWAYS HANDED OUR OWN REGISTRATION. Without `serviceWorkerRegistration` the SDK
 * registers `/firebase-messaging-sw.js` ITSELF, which beside the Workbox worker is two workers on
 * one scope — and the documented symptom is the app reloading itself continuously after every
 * deploy (vite-plugin-pwa #777). A failure that appears only in a deployed console, never in a test.
 * `__tests__/registration.test.ts` reads this file and fails if the argument is ever dropped.
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
 * ⚠ CHECKED BEFORE ANYTHING IS OFFERED, because the two unsupported cases need opposite messages.
 * "Add the console to your home screen first" is actionable; "your browser cannot do this" is not,
 * and showing the wrong one teaches an operator either to give up or to hunt for a setting that
 * does not exist.
 */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return { supported: false, reason: "unsupported-browser" }

  const hasApi =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  if (hasApi) return { supported: true }

  // ⚠ On iOS/iPadOS in a browser tab, `PushManager` is simply ABSENT — there is no error to catch
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
 * ⚠ CALL THIS ONLY FROM A DELIBERATE OPERATOR ACTION (FR-023). There is exactly one prompt per
 * browser per lifetime, and a denial is NOT RECOVERABLE IN-APP on any browser — after it, nothing
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
 * produce a token. ⚠ On iOS the token is sometimes not obtainable until Safari has been closed and
 * reopened after granting permission (research R12) — a documented platform behaviour we cannot fix
 * from here, which is why the caller reports "not enabled yet" rather than an error.
 */
export async function obtainToken(): Promise<string | null> {
  if (!pushSupport().supported) return null
  if (permissionState() !== "granted") return null

  const registration = getRegistration()
  // ⚠ NO REGISTRATION MEANS NO TOKEN — we do NOT fall through and let the SDK make its own. That
  // would silently create the second service worker this whole design exists to prevent.
  if (!registration) return null

  const [{ initializeApp, getApps }, { getMessaging, getToken, isSupported }] = await Promise.all([
    import("firebase/app"),
    import("firebase/messaging"),
  ])

  // The SDK's own capability check — stricter than ours and worth asking, but useless on its own:
  // it cannot tell us WHY, which is what `pushSupport()` is for.
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
