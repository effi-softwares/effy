import type {
  ExceptionOutcome,
  DeliveryExceptionListDTO,
  ResolveExceptionResponse,
  StaffActionResponse,
  StaffParcelReturnResponse,
} from "@effy/shared-types";

import { api } from "@/lib/api";

// The data layer for the delivery-exceptions console (064). Screens never touch the api client
// directly (Principle VI). Both endpoints live on the `fleet` cold-path service.

export async function listExceptions(includeResolved: boolean): Promise<DeliveryExceptionListDTO> {
  const q = includeResolved ? "?includeResolved=true" : "";
  return api.get<DeliveryExceptionListDTO>(`/fleet/v1/exceptions${q}`);
}

export async function resolveException(id: string, note: string | null, outcome: ExceptionOutcome | null = null): Promise<ResolveExceptionResponse> {
  return api.post<ResolveExceptionResponse>(`/fleet/v1/exceptions/${id}/resolve`, {
    note: note ?? undefined,
    outcome: outcome ?? undefined,
    changeId: crypto.randomUUID(),
  });
}

/** 088 — the parcels from a round's failed drops were handed in at the hub. One action per round. */
export async function recordReturn(roundId: string, changeId: string): Promise<StaffParcelReturnResponse> {
  return api.post<StaffParcelReturnResponse>(`/fleet/v1/dispatch/rounds/${roundId}/return`, { changeId });
}

/** 093 — decide a package a driver declared missing: found (planned again) or lost. */
export async function resolveHold(holdId: string, resolution: "found" | "lost"): Promise<StaffActionResponse> {
  return api.post<StaffActionResponse>(`/fleet/v1/held-packages/${holdId}/resolve`, { resolution });
}

/** 093 — a vehicle found unsafe has been fixed or swapped. */
export async function clearVehicleCheck(checkId: string, note: string): Promise<StaffActionResponse> {
  return api.post<StaffActionResponse>(`/fleet/v1/vehicle-checks/${checkId}/clear`, { note });
}
