import type { CoverageResponse } from "@effy/shared-types";

import * as repo from "./repository";

/** Every judgement is in one SQL statement; nothing is filtered or re-counted here. */
export async function readCoverage(): Promise<CoverageResponse> {
  return { gaps: await repo.coverageGaps() };
}
