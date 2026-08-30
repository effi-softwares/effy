import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  AdminDriverCreateRequest,
  AdminDriverStatusRequest,
  AdminDriverUpdateRequest,
  DriverExceptionKind,
} from "@effy/shared-types";

import type { DriverListParams, ExceptionListParams } from "./model";
import * as repo from "./repo";

// Server state lives ONLY in the TanStack Query cache (Principle VI) — never hand-cached in
// component state. List queries are keyed on their params so each filter combination caches
// independently; mutations INVALIDATE rather than patch.

export const driverKeys = {
  all: ["drivers"] as const,
  list: (p: DriverListParams) => ["drivers", "list", p] as const,
  detail: (id: string) => ["drivers", "detail", id] as const,
  audit: (id: string) => ["drivers", "audit", id] as const,
  history: (id: string) => ["drivers", "history", id] as const,
  run: (id: string) => ["drivers", "run", id] as const,
  proof: (id: string) => ["drivers", "proof", id] as const,
  duty: ["drivers", "duty"] as const,
  stranded: ["drivers", "stranded"] as const,
  exceptions: (p: ExceptionListParams) => ["drivers", "exceptions", p] as const,
  readiness: ["drivers", "readiness"] as const,
  zones: ["drivers", "zones"] as const,
};

export const driversListQuery = (p: DriverListParams) =>
  queryOptions({ queryKey: driverKeys.list(p), queryFn: () => repo.listDrivers(p) });

export const driverDetailQuery = (id: string) =>
  queryOptions({ queryKey: driverKeys.detail(id), queryFn: () => repo.getDriver(id) });

export const driverAuditQuery = (id: string) =>
  queryOptions({ queryKey: driverKeys.audit(id), queryFn: () => repo.getDriverAudit(id) });

export const driverHistoryQuery = (id: string) =>
  queryOptions({ queryKey: driverKeys.history(id), queryFn: () => repo.getHistory(id) });

export const runDetailQuery = (runId: string) =>
  queryOptions({ queryKey: driverKeys.run(runId), queryFn: () => repo.getRun(runId) });

export const proofQuery = (deliveryTaskId: string) =>
  queryOptions({
    queryKey: driverKeys.proof(deliveryTaskId),
    queryFn: () => repo.getProof(deliveryTaskId),
    // ⚠ The media URL is a TIME-LIMITED presigned link and issuing one is audited. Caching it for a
    // long time would either serve an expired URL or hide repeat views from the audit trail; a short
    // stale time keeps the two honest.
    staleTime: 60_000,
    gcTime: 60_000,
  });

export const dutyQuery = () =>
  queryOptions({
    queryKey: driverKeys.duty,
    queryFn: () => repo.getDuty(),
    // "Who is working right now" is a live question. 30 s is short enough to be current and long
    // enough not to poll the database from every open console tab.
    refetchInterval: 30_000,
  });

export const strandedQuery = () =>
  queryOptions({ queryKey: driverKeys.stranded, queryFn: () => repo.getStranded() });

export const exceptionsQuery = (p: ExceptionListParams) =>
  queryOptions({ queryKey: driverKeys.exceptions(p), queryFn: () => repo.listExceptions(p) });

export const readinessQuery = () =>
  queryOptions({ queryKey: driverKeys.readiness, queryFn: () => repo.getReadiness() });

export const zonesQuery = () =>
  queryOptions({
    queryKey: driverKeys.zones,
    queryFn: () => repo.listZones(),
    // Zones change with the delivery engine, not with drivers.
    staleTime: 5 * 60_000,
  });

// ── Mutations ────────────────────────────────────────────────────────────────────────────────────

export function useCreateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AdminDriverCreateRequest) => repo.createDriver(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: driverKeys.all });
    },
  });
}

export function useUpdateDriver(driverId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AdminDriverUpdateRequest) => repo.updateDriver(driverId, body),
    onSuccess: () => {
      // ⚠ Invalidate the WHOLE driver namespace, not just the detail. A zone change moves the
      // driver's blocked-reason flags, which appear on the register AND in readiness. Patching the
      // one cache entry would leave a profile saying "ready" beside a readiness view still calling
      // them blocked — the silent-disagreement shape 029 and 033 both produced.
      void qc.invalidateQueries({ queryKey: driverKeys.all });
    },
  });
}

export function useSetDriverStatus(driverId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AdminDriverStatusRequest) => repo.setDriverStatus(driverId, body),
    onSuccess: () => {
      // A status change moves duty eligibility, stranded work and readiness all at once.
      void qc.invalidateQueries({ queryKey: driverKeys.all });
    },
  });
}

export function useResolveException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kind: DriverExceptionKind; id: string; note: string }) =>
      repo.resolveException(v.kind, v.id, v.note),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: driverKeys.all });
    },
  });
}

export function useReleaseStranded() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { collectionTaskIds?: string[]; deliveryTaskIds?: string[]; note: string }) =>
      repo.releaseStranded(v),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: driverKeys.all });
    },
  });
}

export function useEndDutySession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => repo.endDutySession(sessionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: driverKeys.all });
    },
  });
}
