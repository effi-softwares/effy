import { useStore } from "@tanstack/react-store"
import { RefreshCw } from "lucide-react"

import { Button } from "@effy/design-system/ui"

import { applyUpdate, pwaStore } from "@/lib/pwa"
import { track } from "@/lib/telemetry"

/** "A new version is ready" — the waiting service worker takes over only when staff say so. */
export function UpdateBanner() {
  const updateReady = useStore(pwaStore, (s) => s.updateReady)
  if (!updateReady) return null

  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 flex items-center gap-3 rounded-xl border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg"
    >
      <RefreshCw aria-hidden="true" className="size-4 shrink-0" />
      <span className="font-medium">A new version of back-office is ready.</span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          track({ name: "sw_update_applied" })
          applyUpdate()
        }}
      >
        Reload
      </Button>
    </div>
  )
}
