import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type { GrantCapabilityRequest } from "@effy/shared-types";

import * as repo from "./capabilityRepo";

export const capabilityKeys = {
  forDriver: (id: string) => ["drivers", "capabilities", id] as const,
  coverage: ["drivers", "coverage"] as const,
};

export const driverCapabilitiesQuery = (driverId: string) =>
  queryOptions({
    queryKey: capabilityKeys.forDriver(driverId),
    queryFn: () => repo.listCapabilities(driverId),
  });

export const coverageQuery = () =>
  queryOptions({ queryKey: capabilityKeys.coverage, queryFn: () => repo.getCoverage() });

/**
 * ⚠ EVERY CLEARANCE MUTATION INVALIDATES COVERAGE AND THE DRIVER LIST, not just this driver.
 *
 * Granting one clearance can close a gap in a zone the operator was not looking at, and revoking one
 * can open a gap somewhere else. A stale coverage view after a grant would show a problem the
 * operator has just fixed — which is exactly the state that teaches people to distrust the screen.
 */
function useCapabilityMutation<TArgs, TResult>(fn: (a: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["drivers"] });
    },
  });
}

export function useGrantCapability(driverId: string) {
  return useCapabilityMutation((body: GrantCapabilityRequest) =>
    repo.grantCapability(driverId, body),
  );
}

export function useRevokeCapability(driverId: string) {
  return useCapabilityMutation((capabilityId: string) =>
    repo.revokeCapability(driverId, capabilityId),
  );
}
