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
