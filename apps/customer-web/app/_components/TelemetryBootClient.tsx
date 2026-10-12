"use client"

import { useOnDemand } from "@/lib/use-on-demand"

// Load the telemetry island OFF the first-load shared chunk (050). The consent bar + telemetry wiring
// are not critical-path, so they hydrate from their own lazy chunk — which keeps the tight guest
// routes (`/search` sits ~0.1 KB from the 174 KB gate) within budget. This wrapper is the only thing
// in the shared chunk; it carries no analytics/consent code itself.
const loadTelemetryBoot = () => import("./TelemetryBoot").then((m) => m.TelemetryBoot)

export function TelemetryBootClient() {
  const TelemetryBoot = useOnDemand(loadTelemetryBoot)
  return TelemetryBoot ? <TelemetryBoot /> : null
}
