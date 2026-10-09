import { infiniteQueryOptions, keepPreviousData, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  activatePlan, createCollectionRun, createPlan, deleteCollectionRun, getSettings, listCollectionRuns, listPlans,
  putSettings, replacePlan, simulateFee,
  addNonDeliveryDate, createSlot, getDeliveryDays, listSlotGrid, listSlots, patchSlot, putDeliveryDays, removeNonDeliveryDate,
  addCourierExclusion, addCoveragePostcodes, createCoverageGroup, listCoverage, patchCoveragePostcodes,
  removeCourierExclusion, removeCoverageGroup, removeCoveragePostcode, renameCoverageGroup, updateCourier,
  type CoverageFilters,
  createCourierService, listCourierServices, updateCourierService,
  getGoLive, putGoLiveSwitch,
} from "./repo";
import type {
  AddCoveragePostcodesRequest, DeliveryDaysInput, DeliverySettingsDTO, DeliverySlotInput, DeliverySlotPatch,
  FeePlanInput, FeePlanKind, FeeSimulationRequest, NonDeliveryDateInput, PatchCoveragePostcodesRequest, CourierReachUpdateDTO,
  CourierServiceInput, GoLiveSwitchRequest,
} from "@effy/shared-types";

// Server state lives ONLY in the TanStack Query cache (Principle VI). Mutations invalidate the root
// rather than hand-patching cached rows.
const ROOT = ["back-office", "delivery"] as const;

/** Root of every fee-plan query — what the live channel's `pricing` kind re-reads (features/live/routes.ts). */
export const PLANS_ROOT = [...ROOT, "plans"] as const;
export const plansQuery = (kind: FeePlanKind) => queryOptions({ queryKey: [...PLANS_ROOT, kind] as const, queryFn: () => listPlans(kind) });
export const settingsQuery = () => queryOptions({ queryKey: [...ROOT, "settings"] as const, queryFn: getSettings });

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ROOT });
}

export function useSavePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: FeePlanInput }) => (id ? replacePlan(id, body) : createPlan(body)),
    onSuccess: () => invalidate(qc),
  });
}
export function useActivatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmZeroFloor }: { id: string; confirmZeroFloor: boolean }) => activatePlan(id, confirmZeroFloor),
    onSuccess: () => invalidate(qc),
  });
}
/** ⚠ A mutation only in the HTTP sense: it changes nothing, so it invalidates nothing. */
export function useSimulateFee() {
  return useMutation({ mutationFn: (b: FeeSimulationRequest) => simulateFee(b) });
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
/**
 * 078 — the windows WITH how full each is, day by day. Its key sits under `slots`, so the same live
 * update that re-reads the list re-reads the grid.
 */
export const slotGridQuery = () =>
  queryOptions({ queryKey: [...ROOT, "slots", "grid"] as const, queryFn: listSlotGrid });
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
export const useUpdateCourier = () => useCoverageMutation((change: CourierReachUpdateDTO) => updateCourier(change));
export const useAddCourierExclusion = () => useCoverageMutation((v: { postcode: string; reason: string }) => addCourierExclusion(v.postcode, v.reason));
export const useRemoveCourierExclusion = () => useCoverageMutation((postcode: string) => removeCourierExclusion(postcode));

// ── 080 — courier services ──────────────────────────────────────────────────────────────────────
export const courierServicesQuery = () =>
  queryOptions({ queryKey: ["delivery", "courier-services"] as const, queryFn: () => listCourierServices() });
export const useCreateCourierService = () => useCoverageMutation((b: CourierServiceInput) => createCourierService(b));
export const useUpdateCourierService = () => useCoverageMutation((v: { id: string; body: CourierServiceInput }) => updateCourierService(v.id, v.body));

// ── going live with the new delivery model (083) ───────────────────────────────────────────────────

/**
 * ⚠ Under the delivery ROOT on purpose: every delivery mutation on the other tabs (a plan activated,
 * a window disabled, a postcode removed) invalidates the root, and each of them can change whether
 * the platform is ready. The live `coverage` kind re-reads it too (features/live/routes.ts).
 */
export const GO_LIVE_ROOT = [...ROOT, "go-live"] as const;
export const goLiveQuery = () => queryOptions({ queryKey: GO_LIVE_ROOT, queryFn: getGoLive });

export function useSetGoLiveSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GoLiveSwitchRequest) => putGoLiveSwitch(body),
    // Settled, not success: a refusal means the page is showing something that is no longer true.
    onSettled: () => invalidate(qc),
  });
}
