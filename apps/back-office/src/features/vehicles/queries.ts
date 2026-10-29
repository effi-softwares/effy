import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type {
  HoldingIssueRequest,
  HoldingReturnRequest,
  VehicleCreateRequest,
  VehicleStatusRequest,
  VehicleUpdateRequest,
} from "@effy/shared-types"

import * as repo from "./repo"

export const vehicleKeys = {
  all: ["vehicles"] as const,
  detail: (id: string) => ["vehicles", "detail", id] as const,
}

export const vehicleDetailQuery = (id: string) =>
  queryOptions({ queryKey: vehicleKeys.detail(id), queryFn: () => repo.getVehicle(id) })

function useFleetMutation<TArgs, TResult>(fn: (a: TArgs) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: vehicleKeys.all })
      void qc.invalidateQueries({ queryKey: ["drivers"] })
    },
  })
}

export function useCreateVehicle() {
  return useFleetMutation((body: VehicleCreateRequest) => repo.createVehicle(body))
}

export function useUpdateVehicle(vehicleId: string) {
  return useFleetMutation((body: VehicleUpdateRequest) => repo.updateVehicle(vehicleId, body))
}

export function useSetVehicleStatus(vehicleId: string) {
  return useFleetMutation((body: VehicleStatusRequest) => repo.setVehicleStatus(vehicleId, body))
}

export function useIssueVehicle(vehicleId: string) {
  return useFleetMutation((body: HoldingIssueRequest) => repo.issueVehicle(vehicleId, body))
}

export function useReturnVehicle(vehicleId: string) {
  return useFleetMutation((body: HoldingReturnRequest) => repo.returnVehicle(vehicleId, body))
}
