import { useEffect, useRef } from "react"
import { useNavigate } from "@tanstack/react-router"

import { isDomainError } from "@effy/api-client"
import { toast } from "@effy/design-system/ui"

/**
 * A page whose subject no longer exists (a stale notification, an old link): back to its list with one short
 * sentence, never an error screen (109 FR-015). True while it is leaving, so the page renders nothing meanwhile.
 */
export function useGoneFallback(error: unknown, to: "/orders" | "/catalog", message: string): boolean {
  const navigate = useNavigate()
  const done = useRef(false)
  const gone = isDomainError(error) && error.kind === "not-found"
  useEffect(() => {
    if (!gone || done.current) return
    done.current = true
    toast(message)
    void navigate({ to, replace: true })
  }, [gone, to, message, navigate])
  return gone
}
