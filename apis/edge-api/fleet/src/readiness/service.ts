import type { FleetReadinessResponse } from "@effy/shared-types";

import * as repo from "./repository";

export async function readReadiness(): Promise<FleetReadinessResponse> {
  const [blocked, uncoveredZones, expiring] = await Promise.all([
    repo.blockedDrivers(),
    repo.zoneCoverage(),
    repo.expiringCredentials(),
  ]);
  return { blocked, uncoveredZones, expiring };
}
