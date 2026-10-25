"use client"

import { useEffect, useState } from "react"

import { telemetryEnabled } from "@/lib/config"
import { wireGlobalErrorReporting } from "@/lib/error-tracking"
import { getConsent, initAnalytics, setConsent, type ConsentState } from "@/lib/telemetry"

/**
 * The one client island that turns telemetry on; it ships no SDK itself (posthog-js is imported on demand
 * by lib/telemetry and lib/error-tracking):
 *  • error tracking is wired at once, independent of consent (the SDK loads only if an error fires);
 *  • analytics loads only after consent (at once on mount if consent was given before);
 *  • a minimal consent bar shows while the choice is unknown and telemetry is configured. Declining loads nothing.
 */
export function TelemetryBoot() {
  const [consent, setLocalConsent] = useState<ConsentState>("unknown")

  useEffect(() => {
    if (!telemetryEnabled()) return
    wireGlobalErrorReporting()
    const current = getConsent()
    setLocalConsent(current)
    if (current === "granted") initAnalytics()
  }, [])

  function choose(state: "granted" | "denied") {
    setConsent(state) // persists + (on granted) initialises analytics
    setLocalConsent(state)
  }

  if (!telemetryEnabled() || consent !== "unknown") return null

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 py-3 backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use privacy-friendly analytics to improve Effy. No personal data is collected.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("denied")}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className="rounded-md bg-primary-fill px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
