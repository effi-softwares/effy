"use client"

import { useReportWebVitals } from "next/web-vitals"

import { capture } from "@/lib/telemetry"
import { getConsent } from "@/lib/telemetry"
import posthog from "posthog-js"

/**
 * Core Web Vitals from REAL customers on REAL devices (SC-002).
 *
 * This — not Lighthouse — is the actual gate. Lighthouse CI runs one synthetic profile on CI
 * hardware and is a useful pre-filter that catches gross regressions before merge. But the
 * budget in the spec is stated at the **75th percentile of real users**, and the only way to
 * know that number is to measure the field. A green Lighthouse score and a slow storefront are
 * entirely compatible.
 *
 * Consent-gated like everything else: a customer who has not consented sends nothing.
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    if (getConsent() !== "granted") return

    // Not routed through `capture()` — the taxonomy in lib/telemetry.ts is the PRODUCT event
    // vocabulary, and a performance metric is not a product event. Keeping them separate keeps
    // "what did people do" and "how fast was it" from contaminating each other.
    posthog.capture("web_vitals", {
      metric: metric.name, // LCP | INP | CLS | FCP | TTFB
      value: metric.value,
      rating: metric.rating, // good | needs-improvement | poor
      navigation_type: metric.navigationType,
    })
  })

  return null
}
