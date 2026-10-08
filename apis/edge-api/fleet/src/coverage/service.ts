// Coverage use-cases (062).

import type { CoverageResponse } from "@effy/shared-types";

import * as repo from "./repository";

/**
 * Where the fleet has no cover.
 *
 * ⚠ THE SERVICE ADDS NOTHING TO THE QUERY, AND THAT IS DELIBERATE. Every judgement — which work a
 * zone needs, who is cleared, who can work — is made in one SQL statement so it cannot be made twice
 * and differently. A service-side filter or re-count here would be a second definition of coverage.
 */
export async function readCoverage(): Promise<CoverageResponse> {
  return { gaps: await repo.coverageGaps() };
}
