import type { CapabilityFunction, CapabilityMethod, CoverageGapReason } from "@effy/shared-types";

/** What a driver does at a stop. */
export const FUNCTION_LABEL: Record<CapabilityFunction, string> = {
  collection: "Collect from shops",
  delivery: "Deliver to customers",
};

export const FUNCTION_SHORT: Record<CapabilityFunction, string> = {
  collection: "Collect",
  delivery: "Deliver",
};

/** Which promise the package carries. Chosen by the customer at checkout (047). */
export const METHOD_LABEL: Record<CapabilityMethod, string> = {
  standard: "Standard",
  same_day: "Same-day",
};

/**
 * ⚠ TWO REASONS, AND THE WORDS NAME THE REMEDY, because the remedies are in different places.
 *
 * "Nobody is cleared" is fixed here, by granting somebody a clearance. "Everybody cleared is
 * unavailable" is fixed in the readiness view, by sorting out a licence or a vehicle. A single
 * "uncovered" label would send an operator to the wrong screen half the time.
 */
export const COVERAGE_REASON_LABEL: Record<CoverageGapReason, string> = {
  no_driver_cleared: "Nobody is cleared for this",
  all_cleared_unavailable: "Cleared drivers cannot work today",
};

/** ⚠ null means EVERY ZONE — rendered from the value, never from a server-supplied string. */
export function zoneLabel(zoneName: string | null): string {
  return zoneName ?? "Every zone";
}
