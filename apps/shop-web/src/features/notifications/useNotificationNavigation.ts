import { useEffect } from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"

import { onServiceWorkerNavigate } from "@/lib/pwa"
import { track } from "@/lib/telemetry"

/**
 * Handle the two messages the service worker sends (059, US1).
 *
 *   NAVIGATE — a notification was tapped while this console was already open (FR-014). The worker
 *              focused this window rather than opening a second one, and told us where to go.
 *   REFRESH  — a push arrived for something already on screen, so the worker showed nothing
 *              (FR-030) and nudged us to refetch instead.
 *
 * ⚠ ROUTING HAPPENS HERE, NOT IN THE WORKER. `client.navigate()` would have been one line there and
 * is a full document load: it discards the Query cache, the operator's scroll position and whatever
 * they were half-way through. Going through the router keeps the SPA intact.
 *
 * ⚠ `notif_opened` IS FIRED HERE TOO, for the same reason — a service worker has no PostHog, and
 * giving it one would mean giving it a credential. It is the number that decides whether this slice
 * was worth building, and the engagement signal browsers rate-limit against.
 */
export function useNotificationNavigation(): void {
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()

  useEffect(() => {
    const stop = onServiceWorkerNavigate((path) => {
      // The worker already reduced this to a same-origin path (`safePath`), but this is the point
      // where it becomes navigation, so it is checked again here rather than trusted across a
      // boundary.
      if (!path.startsWith("/") || path.startsWith("//")) return
      void navigate({ to: path })
    })

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; path?: string; notificationType?: string } | null
      if (data?.type === "NAVIGATE" && data.notificationType) {
        track({ name: "notif_opened", type: data.notificationType })
      }
      if (data?.type === "REFRESH") {
        // Only what is on screen. A console with a dozen cached screens must not fire a dozen
        // requests because one push arrived.
        void queryClient.invalidateQueries({ refetchType: "active" })
      }
    }

    navigator.serviceWorker?.addEventListener("message", onMessage)
    return () => {
      stop()
      navigator.serviceWorker?.removeEventListener("message", onMessage)
    }
  }, [navigate, queryClient, router])
}
