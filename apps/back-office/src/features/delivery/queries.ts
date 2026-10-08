import { infiniteQueryOptions, keepPreviousData, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  activatePlan, createCollectionRun, createPlan, deleteCollectionRun, getSettings, listCollectionRuns, listPlans,
  listRings, putSettings,
  type NewPlanBody,
  addNonDeliveryDate, createSlot, getDeliveryDays, listSlots, patchSlot, putDeliveryDays, removeNonDeliveryDate,
  addCourierExclusion, addCoveragePostcodes, createCoverageGroup, listCoverage, patchCoveragePostcodes,
  removeCourierExclusion, removeCoverageGroup, removeCoveragePostcode, renameCoverageGroup, setCourierOffered,
  type CoverageFilters,
} from "./repo";
import type {
  AddCoveragePostcodesRequest, DeliveryDaysInput, DeliverySettingsDTO, DeliverySlotInput, DeliverySlotPatch,
  NonDeliveryDateInput, PatchCoveragePostcodesRequest,
} from "@effy/shared-types";

// Server state lives ONLY in the TanStack Query cache (Principle VI). Mutations invalidate the root
// rather than hand-patching cached rows.
const ROOT = ["back-office", "delivery"] as const;

export const ringsQuery = () => queryOptions({ queryKey: [...ROOT, "rings"] as const, queryFn: listRings });
export const plansQuery = () => queryOptions({ queryKey: [...ROOT, "plans"] as const, queryFn: listPlans });
export const settingsQuery = () => queryOptions({ queryKey: [...ROOT, "settings"] as const, queryFn: getSettings });

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ROOT });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: NewPlanBody) => createPlan(b), onSuccess: () => invalidate(qc) });
}
export function useActivatePlan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => activatePlan(id), onSuccess: () => invalidate(qc) });
}
export function usePutSettings() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: DeliverySettingsDTO) => putSettings(b), onSuccess: () => invalidate(qc) });
}

// ── Collection runs (047 US2) ────────────────────────────────────────────

export const collectionRunsQuery = () =>
  queryOptions({ queryKey: [...ROOT, "collection-runs"] as const, queryFn: listCollectionRuns });


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

// ── 069: same-day slots and the standard-delivery calendar ────────────────────────────────────────

/**
 * ⚠ NOT POLLED (071). "Booked today" moves as customers pay; a live `slots` update re-reads this
 * when a same-day place is confirmed or freed, so an operator deciding whether to raise a slot's
 * capacity is reading the current number without the console asking every 30 seconds.
 */
export const slotsQuery = () =>
  queryOptions({ queryKey: [...ROOT, "slots"] as const, queryFn: listSlots });
export const deliveryDaysQuery = () =>
  queryOptions({ queryKey: [...ROOT, "days"] as const, queryFn: getDeliveryDays });

export function useCreateSlot() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: DeliverySlotInput) => createSlot(b), onSuccess: () => invalidate(qc) });
}
export function usePatchSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, body }: { slotId: string; body: DeliverySlotPatch }) => patchSlot(slotId, body),
    onSuccess: () => invalidate(qc),
  });
}
export function usePutDeliveryDays() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: DeliveryDaysInput) => putDeliveryDays(b), onSuccess: () => invalidate(qc) });
}
export function useAddNonDeliveryDate() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: NonDeliveryDateInput) => addNonDeliveryDate(b), onSuccess: () => invalidate(qc) });
}
export function useRemoveNonDeliveryDate() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (day: string) => removeNonDeliveryDate(day), onSuccess: () => invalidate(qc) });
}

// ── 076: Effy delivery coverage ───────────────────────────────────────────────────────────────────

/** Root of every coverage query — what the live channel's `coverage` kind re-reads (features/live/routes.ts). */
export const COVERAGE_ROOT = [...ROOT, "coverage"] as const;

/**
 * The list, page by page. ⚠ `keepPreviousData`, so typing in the search box does not blank the
 * table between answers.
 */
export const coverageQuery = (filters: CoverageFilters) =>
  infiniteQueryOptions({
    queryKey: [...COVERAGE_ROOT, filters] as const,
    queryFn: ({ pageParam }) => listCoverage(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  });

function useCoverageMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate(qc) });
}
export const useAddCoveragePostcodes = () => useCoverageMutation((b: AddCoveragePostcodesRequest) => addCoveragePostcodes(b));
export const usePatchCoveragePostcodes = () => useCoverageMutation((b: PatchCoveragePostcodesRequest) => patchCoveragePostcodes(b));
export const useRemoveCoveragePostcode = () => useCoverageMutation((postcode: string) => removeCoveragePostcode(postcode));
export const useCreateCoverageGroup = () => useCoverageMutation((name: string) => createCoverageGroup(name));
export const useRenameCoverageGroup = () => useCoverageMutation((v: { id: string; name: string }) => renameCoverageGroup(v.id, v.name));
export const useRemoveCoverageGroup = () =>
  useCoverageMutation((v: { id: string; confirmNoDrivers: boolean }) => removeCoverageGroup(v.id, v.confirmNoDrivers));
export const useSetCourierOffered = () => useCoverageMutation((offered: boolean) => setCourierOffered(offered));
export const useAddCourierExclusion = () => useCoverageMutation((v: { postcode: string; reason: string }) => addCourierExclusion(v.postcode, v.reason));
export const useRemoveCourierExclusion = () => useCoverageMutation((postcode: string) => removeCourierExclusion(postcode));
