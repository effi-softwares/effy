import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type { GrantCapabilityRequest } from "@effy/shared-types"

import * as repo from "./capabilityRepo"

const capabilityKeys = {
  forDriver: (id: string) => ["drivers", "capabilities", id] as const,
  coverage: ["drivers", "coverage"] as const,
}

export const driverCapabilitiesQuery = (driverId: string) =>
  queryOptions({
    queryKey: capabilityKeys.forDriver(driverId),
    queryFn: () => repo.listCapabilities(driverId),
  })

export const coverageQuery = () =>
  queryOptions({ queryKey: capabilityKeys.coverage, queryFn: () => repo.getCoverage() })

function useCapabilityMutation<TArgs, TResult>(fn: (a: TArgs) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["drivers"] })
    },
  })
}

export function useGrantCapability(driverId: string) {
  return useCapabilityMutation((body: GrantCapabilityRequest) => repo.grantCapability(driverId, body))
}

export function useRevokeCapability(driverId: string) {
  return useCapabilityMutation((capabilityId: string) => repo.revokeCapability(driverId, capabilityId))
}
