"use client"

import { useEffect, useState } from "react"

import { telemetryEnabled } from "@/lib/config"
import { wireGlobalErrorReporting } from "@/lib/error-tracking"
import { getConsent, initAnalytics, setConsent, type ConsentState } from "@/lib/telemetry"

/**
 * The one client island that turns telemetry on (050 US1/US2/US4). It ships NO analytics SDK itself —
 * posthog-js is dynamically imported by lib/telemetry (analytics, on consent) and lib/error-tracking
 * (errors, independent of consent), so this component costs the guest critical path almost nothing.
 *
 *  • Error tracking is wired immediately (consent-independent, FR-002/Q1); the SDK still only loads if
 *    an error actually fires.
 *  • Analytics loads only once the customer consents (Principle VII). If they already consented on a
 *    prior visit, it initialises on mount.
 *  • A minimal consent bar is shown only while the choice is unknown, and only when telemetry is
 *    enabled + configured. Declining loads nothing.
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
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
