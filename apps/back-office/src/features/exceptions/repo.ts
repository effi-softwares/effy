import type { DeliveryExceptionListDTO, ResolveExceptionResponse } from "@effy/shared-types";

import { api } from "@/lib/api";

// The data layer for the delivery-exceptions console (064). Screens never touch the api client
// directly (Principle VI). Both endpoints live on the `fleet` cold-path service.

export async function listExceptions(includeResolved: boolean): Promise<DeliveryExceptionListDTO> {
  const q = includeResolved ? "?includeResolved=true" : "";
  return api.get<DeliveryExceptionListDTO>(`/fleet/v1/exceptions${q}`);
}

export async function resolveException(id: string, note: string | null): Promise<ResolveExceptionResponse> {
  return api.post<ResolveExceptionResponse>(`/fleet/v1/exceptions/${id}/resolve`, {
    note: note ?? undefined,
    changeId: crypto.randomUUID(),
  });
}
