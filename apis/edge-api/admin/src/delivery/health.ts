// Delivery configuration health (031 US4) — the three ways a delivery configuration goes quietly
// wrong, surfaced instead of silently degrading.
//
// ⚠ THIS IS THE PIECE THAT WOULD HAVE CAUGHT THE TWO DEFECTS THAT MOTIVATED FEATURE 031:
//
//   unknownPlace  →  postcode 3001 in Melbourne Metro. Melbourne's PO-box code: no street addresses,
//                    and groceries cannot be delivered to a post office box. It entered through a
//                    free-text field that checked the SHAPE of a postcode and nothing else, and was
//                    found weeks later by a hand-written coverage query.
//
//   unconfigured  →  zone REGIONAL: it contains 3350 (Ballarat) and 3550 (Bendigo) and has ZERO
//                    active inbound offerings. So the storefront answers {"serviced":true} for those
//                    shoppers and checkout can quote them nothing — they are invited in and stopped
//                    at payment. That is 025's FR-014b ("serviceability MUST be decided by the same
//                    rules that decide it at checkout, so the two answers can never disagree")
//                    violated in DATA rather than in code: every Go test passes.
//
// ⚠ ITS ACCEPTANCE TEST IS AVAILABLE ON DAY ONE. Run against the data as it stood when this feature
// began, `unconfigured` MUST return 3350 and 3550. An endpoint that returns empty on its first run has
// not been proven to find anything — it has only been proven to run.
import * as repo from "./repository";
import type { AreaHealth } from "./types";

export async function deliveryHealth(): Promise<AreaHealth> {
  // Independent questions, so they are asked concurrently — a slow one must not serialise the others.
  const [unknownPlace, unconfigured, emptyZones] = await Promise.all([
    repo.areasWithUnknownPlace(),
    repo.unconfiguredAreas(),
    repo.emptyZones(),
  ]);

  return { unknownPlace, unconfigured, emptyZones };
}

/**
 * Counts for the misconfiguration signal.
 *
 * ⚠ Counts ONLY — never a postcode, never an area name. This is the shape a metric would take, and
 * Principle VII forbids high-cardinality labels and location data in operational telemetry.
 *
 * ⚠ The metric itself is DEFERRED: no cold-path service on this platform emits one, so there is
 * nothing to add a gauge to (plan §Telemetry). This function exists so the signal is available on
 * demand, and so wiring a real metric later is a caller change rather than a rewrite.
 */
export function healthCounts(health: AreaHealth): Record<string, number> {
  return {
    unknown_place: health.unknownPlace.length,
    unconfigured: health.unconfigured.length,
    empty_zone: health.emptyZones.length,
  };
}
