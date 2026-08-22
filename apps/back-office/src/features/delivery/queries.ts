import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  activatePlan, addPostcode, createCollectionRun, createPlan, createRing, createZone,
  deleteCollectionRun, deleteException, getSettings, listCollectionRuns, listExceptions, listPlans,
  listRings, listZones, patchZone, putException, putSettings, removePostcode, suggestRing,
  type NewPlanBody, type NewRingBody, type NewZoneBody, type ZonePatchBody,
} from "./repo";
import type { DeliverySettingsDTO } from "@effy/shared-types";

// Server state lives ONLY in the TanStack Query cache (Principle VI). Mutations invalidate the root
// rather than hand-patching cached rows.
const ROOT = ["back-office", "delivery"] as const;

export const ringsQuery = () => queryOptions({ queryKey: [...ROOT, "rings"] as const, queryFn: listRings });
export const plansQuery = () => queryOptions({ queryKey: [...ROOT, "plans"] as const, queryFn: listPlans });
export const zonesQuery = () => queryOptions({ queryKey: [...ROOT, "zones"] as const, queryFn: listZones });
export const settingsQuery = () => queryOptions({ queryKey: [...ROOT, "settings"] as const, queryFn: getSettings });

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ROOT });
}

export function useCreateRing() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: NewRingBody) => createRing(b), onSuccess: () => invalidate(qc) });
}
export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: NewPlanBody) => createPlan(b), onSuccess: () => invalidate(qc) });
}
export function useActivatePlan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => activatePlan(id), onSuccess: () => invalidate(qc) });
}
export function useCreateZone() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: NewZoneBody) => createZone(b), onSuccess: () => invalidate(qc) });
}
export function usePatchZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ zoneId, body }: { zoneId: string; body: ZonePatchBody }) => patchZone(zoneId, body),
    onSuccess: () => invalidate(qc),
  });
}
export function useAddPostcode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ zoneId, postcode, confirm }: { zoneId: string; postcode: string; confirm: boolean }) =>
      addPostcode(zoneId, postcode, confirm),
    onSuccess: () => invalidate(qc),
  });
}
export function useRemovePostcode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ zoneId, postcode }: { zoneId: string; postcode: string }) => removePostcode(zoneId, postcode),
    onSuccess: () => invalidate(qc),
  });
}
export function useSuggestRing() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (zoneId: string) => suggestRing(zoneId), onSuccess: () => invalidate(qc) });
}
export function usePutSettings() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: DeliverySettingsDTO) => putSettings(b), onSuccess: () => invalidate(qc) });
}

// ── Collection runs & same-day exceptions (047 US2/US3) ────────────────────────────────────────────

export const collectionRunsQuery = () =>
  queryOptions({ queryKey: [...ROOT, "collection-runs"] as const, queryFn: listCollectionRuns });

export const exceptionsQuery = (zoneId: string) =>
  queryOptions({ queryKey: [...ROOT, "exceptions", zoneId] as const, queryFn: () => listExceptions(zoneId) });

export function useCreateCollectionRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runTime, label }: { runTime: string; label: string | null }) => createCollectionRun(runTime, label),
    onSuccess: () => invalidate(qc),
  });
}
export function useDeleteCollectionRun() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deleteCollectionRun(id), onSuccess: () => invalidate(qc) });
}
export function usePutException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ zoneId, shopId, mode }: { zoneId: string; shopId: string; mode: "on" | "off" }) =>
      putException(zoneId, shopId, mode),
    onSuccess: () => invalidate(qc),
  });
}
export function useDeleteException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ zoneId, shopId }: { zoneId: string; shopId: string }) => deleteException(zoneId, shopId),
    onSuccess: () => invalidate(qc),
  });
}
