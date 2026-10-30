"use client"

import type { PostHog } from "posthog-js"

import { posthogConfig, telemetryEnabled } from "@/lib/config"

/**
 * Web error tracking, separate from analytics:
 *  1. Independent of analytics consent (it carries only the message and a source tag, no PII), but
 *  gated by the platform kill switch (`telemetry/enabled`).
 *  2. Off the guest critical path: posthog-js is imported only when an error fires, into its own named
 *  instance ("effy_errors", memory persistence), so it never collides with lib/telemetry.ts's.
 */

let errPh: PostHog | null = null
let loading: Promise<void> | null = null

async function ensure(): Promise<void> {
  if (errPh || loading || typeof window === "undefined") return
  if (!telemetryEnabled()) return // kill switch - no SDK loads
  const { key, host, ingestPath } = posthogConfig()
  if (!key) return

  loading = import("posthog-js")
    .then(({ default: posthog }) => {
      // A dedicated named instance for exceptions only - no pageviews, no autocapture, no replay, and
      // memory-only persistence (an error reporter has no reason to write to the visitor's disk).
      const instance = posthog.init(
        key,
        {
          api_host: ingestPath,
          ui_host: host,
          capture_pageview: false,
          autocapture: false,
          disable_session_recording: true,
          persistence: "memory",
        },
        "effy_errors",
      )
      errPh = (instance as PostHog | undefined) ?? null
    })
    .catch(() => {
      // Error tracking must never break the storefront. A failed fetch leaves errPh null → no-op.
    })
    .finally(() => {
      loading = null
    })
  await loading
}

/** Report one error/exception. Safe to call before load; the SDK is fetched lazily on first use. */
export async function reportError(
  error: unknown,
  context?: Record<string, string>,
): Promise<void> {
  await ensure()
  errPh?.capture("$exception", {
    message: error instanceof Error ? error.message : String(error),
    ...context,
  })
}

/** Wire uncaught errors + unhandled rejections to {@link reportError}. Call once at boot. */
export function wireGlobalErrorReporting(): void {
  if (typeof window === "undefined") return
  window.addEventListener("error", (e) => {
    void reportError(e.error ?? e.message, { source: "window.onerror" })
  })
  window.addEventListener("unhandledrejection", (e) => {
    void reportError(e.reason, { source: "unhandledrejection" })
  })
}
