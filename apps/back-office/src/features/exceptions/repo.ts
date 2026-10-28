import type {
  ExceptionOutcome,
  DeliveryExceptionDTO,
  DeliveryExceptionListDTO,
  ListPage,
  ResolveExceptionResponse,
  StaffActionResponse,
  StaffParcelReturnResponse,
} from "@effy/shared-types"

import { api } from "@/lib/api"

/** The board with its first 100 open failures (the overview's figures). */
export async function listExceptions(): Promise<DeliveryExceptionListDTO> {
  return api.get<DeliveryExceptionListDTO>("/fleet/v1/exceptions?pageSize=100")
}

/** The board for the address's view (103): the failures' page as a list page, and the rest of the board beside it. */
export async function fetchExceptionsBoard(qs: URLSearchParams, signal: AbortSignal): Promise<ExceptionsBoardPage> {
  const board = await api.get<DeliveryExceptionListDTO>(`/fleet/v1/exceptions?${qs}`, { signal })
  return { ...board.exceptions, board }
}

export type ExceptionsBoardPage = ListPage<DeliveryExceptionDTO> & { board: DeliveryExceptionListDTO }

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
