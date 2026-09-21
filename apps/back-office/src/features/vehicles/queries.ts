import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  HoldingIssueRequest,
  HoldingReturnRequest,
  VehicleCreateRequest,
  VehicleStatusRequest,
  VehicleUpdateRequest,
} from "@effy/shared-types";

import type { VehicleListParams } from "./model";
import * as repo from "./repo";

// Server state lives ONLY in the TanStack Query cache (Principle VI) — never hand-cached in
// component state. Mutations INVALIDATE rather than patch.

export const vehicleKeys = {
  all: ["vehicles"] as const,
  list: (p: VehicleListParams) => ["vehicles", "list", p] as const,
  detail: (id: string) => ["vehicles", "detail", id] as const,
};

export const vehiclesListQuery = (p: VehicleListParams) =>
  queryOptions({ queryKey: vehicleKeys.list(p), queryFn: () => repo.listVehicles(p) });

export const vehicleDetailQuery = (id: string) =>
  queryOptions({ queryKey: vehicleKeys.detail(id), queryFn: () => repo.getVehicle(id) });

// ── Mutations ────────────────────────────────────────────────────────────────────────────────────
//
// ⚠ Each invalidates `vehicleKeys.all` AND the driver keys. Issuing a vehicle changes what a DRIVER
// holds and can change whether they are blocked from work — two screens read that, and a stale one
// would show a driver as unable to work seconds after the operator fixed it.

function useFleetMutation<TArgs, TResult>(fn: (a: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: vehicleKeys.all });
      void qc.invalidateQueries({ queryKey: ["drivers"] });
    },
  });
}

export function useCreateVehicle() {
  return useFleetMutation((body: VehicleCreateRequest) => repo.createVehicle(body));
}

export function useUpdateVehicle(vehicleId: string) {
  return useFleetMutation((body: VehicleUpdateRequest) => repo.updateVehicle(vehicleId, body));
}

export function useSetVehicleStatus(vehicleId: string) {
  return useFleetMutation((body: VehicleStatusRequest) => repo.setVehicleStatus(vehicleId, body));
}

export function useIssueVehicle(vehicleId: string) {
  return useFleetMutation((body: HoldingIssueRequest) => repo.issueVehicle(vehicleId, body));
}

export function useReturnVehicle(vehicleId: string) {
  return useFleetMutation((body: HoldingReturnRequest) => repo.returnVehicle(vehicleId, body));
}
