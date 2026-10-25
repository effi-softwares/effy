import type {
  ExceptionOutcome,
  DeliveryExceptionListDTO,
  ResolveExceptionResponse,
  StaffActionResponse,
  StaffParcelReturnResponse,
} from "@effy/shared-types"

import { api } from "@/lib/api"

export async function listExceptions(includeResolved: boolean): Promise<DeliveryExceptionListDTO> {
  const q = includeResolved ? "?includeResolved=true" : ""
  return api.get<DeliveryExceptionListDTO>(`/fleet/v1/exceptions${q}`)
}

export async function resolveException(
  id: string,
  note: string | null,
  outcome: ExceptionOutcome | null = null,
): Promise<ResolveExceptionResponse> {
  return api.post<ResolveExceptionResponse>(`/fleet/v1/exceptions/${id}/resolve`, {
    note: note ?? undefined,
    outcome: outcome ?? undefined,
    changeId: crypto.randomUUID(),
  })
}

export async function recordReturn(roundId: string, changeId: string): Promise<StaffParcelReturnResponse> {
  return api.post<StaffParcelReturnResponse>(`/fleet/v1/dispatch/rounds/${roundId}/return`, { changeId })
}

export async function resolveHold(holdId: string, resolution: "found" | "lost"): Promise<StaffActionResponse> {
  return api.post<StaffActionResponse>(`/fleet/v1/held-packages/${holdId}/resolve`, { resolution })
}

export async function clearVehicleCheck(checkId: string, note: string): Promise<StaffActionResponse> {
  return api.post<StaffActionResponse>(`/fleet/v1/vehicle-checks/${checkId}/clear`, { note })
}
