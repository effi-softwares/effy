import type { CapabilityFunction, CoverageGapReason } from "@effy/shared-types"

export const FUNCTION_LABEL: Record<CapabilityFunction, string> = {
  collection: "Collect from shops",
  delivery: "Deliver to customers",
}

export const FUNCTION_SHORT: Record<CapabilityFunction, string> = {
  collection: "Collect",
  delivery: "Deliver",
}

export const FUNCTION_HEADING: Record<CapabilityFunction, string> = {
  collection: "Collects",
  delivery: "Delivers",
}

export const COVERAGE_REASON_LABEL: Record<CoverageGapReason, string> = {
  no_driver_cleared: "Nobody is cleared for this",
  all_cleared_unavailable: "Cleared drivers cannot work today",
}

export function zoneLabel(zoneName: string | null): string {
  return zoneName ?? "Everywhere"
}
