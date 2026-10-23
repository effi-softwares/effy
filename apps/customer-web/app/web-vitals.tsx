"use client"

import { useReportWebVitals } from "next/web-vitals"

import { analytics, getConsent } from "@/lib/telemetry"

/** Core Web Vitals from real customers (the budget is the 75th percentile of real users; Lighthouse is only a pre-filter). Consent-gated. */
export function WebVitals() {
  useReportWebVitals((metric) => {
    if (getConsent() !== "granted") return

    // Not routed through `capture` — the taxonomy in lib/telemetry.ts is the product event
    // vocabulary, and a performance metric is not a product event. Keeping them separate keeps
    // "what did people do" and "how fast was it" from contaminating each other.
    //
    // Obtained via `analytics` rather than a static `import posthog from "posthog-js"`. This
    // component is rendered from the root layout, so a static import here would put the whole SDK
    // in the shared chunk of every page — the exact mistake the Amplify quarantine exists to
    // prevent, with a different package. Null until a consenting customer has loaded it.
    const ph = analytics()
    if (!ph) return

    ph.capture("web_vitals", {
      metric: metric.name, // LCP | INP | CLS | FCP | ttfb
      value: metric.value,
      rating: metric.rating, // good | needs-improvement | poor
      navigation_type: metric.navigationType,
    })
  })

  return null
}
