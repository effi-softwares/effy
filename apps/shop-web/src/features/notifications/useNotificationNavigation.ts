import { useEffect } from "react"
import { useRouter, useRouterState } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"

import { onServiceWorkerNavigate } from "@/lib/pwa"
import { track } from "@/lib/telemetry"

import { markNotificationRead } from "./api"
import { takeNotification, withNotification } from "./notificationLink"

/**
 * The service worker's messages, wherever the console is (mounted at the root, so a click that arrives on the
 * sign-in page is not lost): NAVIGATE opens the notification's page with its id on the address (109), and REFRESH
 * re-reads what is on screen. A signed-out console is sent to sign in by the route guard, which keeps the address.
 */
export function useNotificationNavigation(): void {
  const router = useRouter()
  const queryClient = useQueryClient()

  useEffect(() => {
    const go = (path: string, notificationId?: string, type?: string) => {
      if (!path.startsWith("/") || path.startsWith("//")) return
      router.history.push(withNotification(path, notificationId, type))
    }
    const stop = onServiceWorkerNavigate((path) => go(path))

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; path?: string; notificationId?: string; notificationType?: string } | null
      if (data?.type === "NAVIGATE" && typeof data.path === "string") {
        go(data.path, data.notificationId || undefined, data.notificationType)
      }
      if (data?.type === "REFRESH") {
        void queryClient.invalidateQueries({ refetchType: "active" })
      }
    }

    navigator.serviceWorker?.addEventListener("message", onMessage)
    return () => {
      stop()
      navigator.serviceWorker?.removeEventListener("message", onMessage)
    }
  }, [queryClient, router])
}

/**
 * Signed in only (the app shell): a notification id on the address is the operator opening it. The id is removed
 * from the address at once, then the read is recorded (109 FR-017). Not theirs → the console's landing page, so
 * nothing from another person's notification stays on screen (FR-014).
 */
export function useNotificationRead(): void {
  const router = useRouter()
  const search = useRouterState({ select: (s) => s.location.searchStr })
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    const carried = takeNotification(search)
    if (!carried) return
    router.history.replace(`${pathname}${carried.rest}`)
    void markNotificationRead(carried.notificationId).then((result) => {
      if (result === "not-yours") {
        router.history.replace("/")
        return
      }
      track({ name: "notif_opened", type: carried.type, fallback: false })
    })
  }, [search, pathname, router])
}
