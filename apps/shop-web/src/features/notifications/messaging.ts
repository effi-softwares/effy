import { config } from "@/lib/env"
import { getRegistration } from "@/lib/pwa"

type PushSupport =
  | { supported: true }
  | { supported: false; reason: "needs-install" }
  | { supported: false; reason: "unsupported-browser" }

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return { supported: false, reason: "unsupported-browser" }

  const hasApi = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  if (hasApi) return { supported: true }

  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true

  if (iOS && !standalone) return { supported: false, reason: "needs-install" }
  return { supported: false, reason: "unsupported-browser" }
}

export function permissionState(): NotificationPermission {
  if (typeof Notification === "undefined") return "denied"
  return Notification.permission
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied"
  return Notification.requestPermission()
}

export async function obtainToken(): Promise<string | null> {
  if (!pushSupport().supported) return null
  if (permissionState() !== "granted") return null

  const registration = getRegistration()
  if (!registration) return null

  const [{ initializeApp, getApps }, { getMessaging, getToken, isSupported }] = await Promise.all([
    import("firebase/app"),
    import("firebase/messaging"),
  ])

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
    return null
  }
}

export async function forgetToken(): Promise<void> {
  try {
    const [{ getApps }, { deleteToken, getMessaging, isSupported }] = await Promise.all([
      import("firebase/app"),
      import("firebase/messaging"),
    ])
    const app = getApps()[0]
    if (!app || !(await isSupported())) return
    await deleteToken(getMessaging(app))
  } catch {}
}

/** Shows one notification through our own worker, so a person can see the OS lets it through. Nothing is sent. */
export async function showTestNotification(): Promise<boolean> {
  const registration = getRegistration()
  if (!registration || permissionState() !== "granted") return false
  try {
    await registration.showNotification("Test notification", {
      body: "New orders and alerts will appear like this on this device.",
      tag: "effy-test",
      icon: "/web-app-icon-192.png",
      badge: "/notification-badge-96.png",
      data: { webPath: "/settings/notifications" },
    })
    return true
  } catch {
    return false
  }
}

/** "Chrome on macOS" - how the settings screen names this device. A label only, never sent anywhere. */
export function thisDevice(): string {
  if (typeof navigator === "undefined") return "This device"
  const ua = navigator.userAgent
  const touchMac = ua.includes("Macintosh") && navigator.maxTouchPoints > 1
  const os =
    /iPad/.test(ua) || touchMac
      ? "iPad"
      : /iPhone|iPod/.test(ua)
        ? "iPhone"
        : /Android/.test(ua)
          ? "Android"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Mac OS X/.test(ua)
              ? "macOS"
              : /Windows/.test(ua)
                ? "Windows"
                : /Linux/.test(ua)
                  ? "Linux"
                  : null
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\/|FxiOS/.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS/.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches
  if (standalone) return os ? `Effy Shop app on ${os}` : "Effy Shop app"
  if (browser && os) return `${browser} on ${os}`
  return browser ?? os ?? "This device"
}
