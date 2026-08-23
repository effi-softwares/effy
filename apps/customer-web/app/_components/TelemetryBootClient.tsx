"use client"

import dynamic from "next/dynamic"

// Load the telemetry island OFF the first-load shared chunk (050). The consent bar + telemetry wiring
// are not critical-path, so they hydrate from their own lazy chunk — which keeps the tight guest
// routes (`/search` sits ~0.1 KB from the 174 KB gate) within budget. This wrapper is the only thing
// in the shared chunk; it carries no analytics/consent code itself.
const TelemetryBoot = dynamic(
  () => import("./TelemetryBoot").then((m) => m.TelemetryBoot),
  { ssr: false },
)

export function TelemetryBootClient() {
  return <TelemetryBoot />
}
