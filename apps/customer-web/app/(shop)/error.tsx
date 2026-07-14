"use client"

import { useEffect } from "react"

/**
 * The recoverable degraded state (FR-030).
 *
 * When a backend is unreachable or slow to wake, the storefront must degrade to something
 * clear and RECOVERABLE — not a blank page and not a stack trace. The customer gets a way
 * forward (retry), not a dead end.
 *
 * Note where this boundary sits: inside `(shop)`, not at the root. A failure in a personalized
 * region must never take down the public content of the page around it (FR-030) — which is also
 * why the personalized island lives behind its own <Suspense>.
 */
export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Routed to PostHog error tracking by the telemetry layer (Principle VII).
    // The message only — never a token, never the customer's email.
    console.error("storefront error:", error.message)
  }, [error])

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong on our side
      </h1>
      <p className="mt-3 text-muted-foreground">
        This is our problem, not yours. Try again — and if it keeps happening, come back in a
        few minutes.
      </p>
      <button
        onClick={reset}
        className="mt-8 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Try again
      </button>
    </section>
  )
}
