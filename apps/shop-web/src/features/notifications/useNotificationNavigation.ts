import { useEffect } from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"

import { onServiceWorkerNavigate } from "@/lib/pwa"
import { track } from "@/lib/telemetry"

export function useNotificationNavigation(): void {
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()

  useEffect(() => {
    const stop = onServiceWorkerNavigate((path) => {
      if (!path.startsWith("/") || path.startsWith("//")) return
      void navigate({ to: path })
    })

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; path?: string; notificationType?: string } | null
      if (data?.type === "NAVIGATE" && data.notificationType) {
        track({ name: "notif_opened", type: data.notificationType })
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
  }, [navigate, queryClient, router])
}
