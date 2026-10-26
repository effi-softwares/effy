import { useStore } from "@tanstack/react-store"
import { RefreshCw } from "lucide-react"

import { Button } from "@effy/design-system/ui"

import { applyUpdate, pwaStore } from "@/lib/pwa"
import { track } from "@/lib/telemetry"

export function UpdateBanner() {
  const updateReady = useStore(pwaStore, (s) => s.updateReady)
  if (!updateReady) return null

  return (
    <div
      role="status"
      className="flex min-h-12 items-center gap-3 rounded-lg bg-muted px-4 py-3 text-sm text-foreground"
    >
      <RefreshCw aria-hidden="true" className="size-4 shrink-0" />
      <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">A new version of the console is ready.</span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => {
            track({ name: "sw_update_applied" })
            applyUpdate()
          }}
        >
          Reload
        </Button>
      </div>
    </div>
  )
}
