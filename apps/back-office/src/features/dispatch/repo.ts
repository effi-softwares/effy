import type {
  DispatchDayDTO,
  ReassignRoundInput,
  ReorderStopsInput,
} from "@effy/shared-types";

import { api } from "@/lib/api";

// The data layer for the dispatcher console (063). Screens never touch the api client directly
// (Principle VI). Every endpoint lives on the `fleet` cold-path service behind the shared gateway.

export async function getDay(): Promise<DispatchDayDTO> {
  return api.get<DispatchDayDTO>("/fleet/v1/dispatch/day");
}

export async function getRound(id: string): Promise<unknown> {
  return api.get(`/fleet/v1/dispatch/rounds/${id}`);
}

export async function reassign(id: string, body: ReassignRoundInput): Promise<void> {
  await api.post(`/fleet/v1/dispatch/rounds/${id}/reassign`, body);
}

export async function unassign(id: string, expectedUpdatedAt: string): Promise<void> {
  await api.post(`/fleet/v1/dispatch/rounds/${id}/unassign`, { expectedUpdatedAt });
}

export async function reorder(id: string, body: ReorderStopsInput): Promise<void> {
  await api.post(`/fleet/v1/dispatch/rounds/${id}/reorder`, body);
}

export async function lock(id: string, expectedUpdatedAt: string): Promise<void> {
  await api.post(`/fleet/v1/dispatch/rounds/${id}/lock`, { expectedUpdatedAt });
}

export async function unlock(id: string, expectedUpdatedAt: string): Promise<void> {
  // ⚠ The concurrency token travels as a query parameter because this client's DELETE carries no
  // body. It is still REQUIRED — releasing a lock is a write like any other, and a release that
  // silently clobbers somebody else's newer decision is exactly what the token exists to prevent.
  await api.delete(
    `/fleet/v1/dispatch/rounds/${id}/lock?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`,
  );
}
