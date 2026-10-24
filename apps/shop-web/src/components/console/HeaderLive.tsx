import { useEffect, useState } from "react"

import { RefreshCw, WifiOff } from "lucide-react"

import { Button } from "@effy/design-system/ui"
import { useLiveStatus } from "@effy/web-kit/console"

/**
 * The header's live status (Foundations — "Live dot"): a green pulsing dot and "Live" while the console
 * is told about changes; "Reconnecting" / "Offline" in the foreground with an icon (never a hue) once
 * that has lasted a few seconds, with how old the screen is and a way to read it again now.
 */
const APPEAR_AFTER_MS = 4_000

const timeOfDay = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })

export function HeaderLive() {
  const live = useLiveStatus()
  const state = live?.state ?? "live"
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (state === "live") {
      setShown(false)
      return
    }
    const timer = setTimeout(() => setShown(true), APPEAR_AFTER_MS)
    return () => clearTimeout(timer)
  }, [state])

  if (!live) return null

  if (state === "live" || !shown) {
    return (
      <span role="status" className="sh-chip max-sm:hidden">
        <span aria-hidden="true" className="sh-live-dot" />
        Live
      </span>
    )
  }

  const reconnecting = state === "reconnecting"
  return (
    <span role="status" className="sh-chip is-solid pr-1">
      <WifiOff aria-hidden="true" />
      <span className="whitespace-nowrap">
        {reconnecting ? "Reconnecting" : "Offline"}
        <span className="max-md:hidden"> · updated {timeOfDay.format(live.currentAsOf)}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Refresh now"
        onClick={live.refresh}
        className="rounded-full text-background! hover:bg-transparent!"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
      </Button>
    </span>
  )
}
