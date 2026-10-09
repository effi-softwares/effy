import type { CapabilityFunction, CoverageGapReason } from "@effy/shared-types";

/** What a driver does at a stop. */
export const FUNCTION_LABEL: Record<CapabilityFunction, string> = {
  collection: "Collect from shops",
  delivery: "Deliver to customers",
};

export const FUNCTION_SHORT: Record<CapabilityFunction, string> = {
  collection: "Collect",
  delivery: "Deliver",
};

/**
 * 082 — the two things a driver may do, as the section headings of their permissions. There is no
 * delivery method here any more: a driver who delivers in an area delivers whatever Effy delivers there.
 */
export const FUNCTION_HEADING: Record<CapabilityFunction, string> = {
  collection: "Collects",
  delivery: "Delivers",
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

/** ⚠ null means EVERYWHERE — rendered from the value, never from a server-supplied string. */
export function zoneLabel(zoneName: string | null): string {
  return zoneName ?? "Everywhere";
}
