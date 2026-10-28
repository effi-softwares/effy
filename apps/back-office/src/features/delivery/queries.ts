import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"

import {
  activatePlan,
  createCollectionRun,
  createPlan,
  deleteCollectionRun,
  getSettings,
  listCollectionRuns,
  listPlans,
  putSettings,
  replacePlan,
  simulateFee,
  addNonDeliveryDate,
  createSlot,
  getDeliveryDays,
  listSlotGrid,
  listSlots,
  patchSlot,
  putDeliveryDays,
  removeNonDeliveryDate,
  addCourierExclusion,
  addCoveragePostcodes,
  createCoverageGroup,
  listCoverage,
  patchCoveragePostcodes,
  searchCoveragePlaces,
  removeCourierExclusion,
  removeCoverageGroup,
  removeCoveragePostcode,
  renameCoverageGroup,
  updateCourier,
  createCourierService,
  listCourierServices,
  updateCourierService,
} from "./repo"
import { coverageList } from "./coverage/list"
import type {
  AddCoveragePostcodesRequest,
  DeliveryDaysInput,
  DeliverySettingsDTO,
  DeliverySlotInput,
  DeliverySlotPatch,
  FeePlanInput,
  FeePlanKind,
  FeeSimulationRequest,
  NonDeliveryDateInput,
  PatchCoveragePostcodesRequest,
  CourierReachUpdateDTO,
  CourierServiceInput,
} from "@effy/shared-types"

const ROOT = ["back-office", "delivery"] as const

const PLANS_ROOT = [...ROOT, "plans"] as const
export const plansQuery = (kind: FeePlanKind) =>
  queryOptions({ queryKey: [...PLANS_ROOT, kind] as const, queryFn: () => listPlans(kind) })
export const settingsQuery = () => queryOptions({ queryKey: [...ROOT, "settings"] as const, queryFn: getSettings })

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ROOT })
}

export function useSavePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: FeePlanInput }) =>
      id ? replacePlan(id, body) : createPlan(body),
    onSuccess: () => invalidate(qc),
  })
}
export function useActivatePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, confirmZeroFloor }: { id: string; confirmZeroFloor: boolean }) =>
      activatePlan(id, confirmZeroFloor),
    onSuccess: () => invalidate(qc),
  })
}
export function useSimulateFee() {
  return useMutation({ mutationFn: (b: FeeSimulationRequest) => simulateFee(b) })
}
export function usePutSettings() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (b: DeliverySettingsDTO) => putSettings(b), onSuccess: () => invalidate(qc) })
}

export const collectionRunsQuery = () =>
  queryOptions({ queryKey: [...ROOT, "collection-runs"] as const, queryFn: listCollectionRuns })

export function useCreateCollectionRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ runTime, label }: { runTime: string; label: string | null }) => createCollectionRun(runTime, label),
    onSuccess: () => invalidate(qc),
  })
}
export function useDeleteCollectionRun() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => deleteCollectionRun(id), onSuccess: () => invalidate(qc) })
}

export const slotsQuery = () => queryOptions({ queryKey: [...ROOT, "slots"] as const, queryFn: listSlots })
export const slotGridQuery = () =>
  queryOptions({ queryKey: [...ROOT, "slots", "grid"] as const, queryFn: listSlotGrid })
export const deliveryDaysQuery = () => queryOptions({ queryKey: [...ROOT, "days"] as const, queryFn: getDeliveryDays })

export function useCreateSlot() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (b: DeliverySlotInput) => createSlot(b), onSuccess: () => invalidate(qc) })
}
export function usePatchSlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ slotId, body }: { slotId: string; body: DeliverySlotPatch }) => patchSlot(slotId, body),
    onSuccess: () => invalidate(qc),
  })
}
export function usePutDeliveryDays() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (b: DeliveryDaysInput) => putDeliveryDays(b), onSuccess: () => invalidate(qc) })
}
export function useAddNonDeliveryDate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: NonDeliveryDateInput) => addNonDeliveryDate(b),
    onSuccess: () => invalidate(qc),
  })
}
export function useRemoveNonDeliveryDate() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (day: string) => removeNonDeliveryDate(day), onSuccess: () => invalidate(qc) })
}

const COVERAGE_ROOT = [...ROOT, "coverage"] as const

/** The postcode list's first page in its default view: the screens that only need its groups, totals or courier state. */
export const coverageQuery = () =>
  queryOptions({
    queryKey: [...COVERAGE_ROOT, "summary"] as const,
    queryFn: ({ signal }) => listCoverage(coverageList.toQuery(coverageList.initial()), signal),
  })

/** Under the coverage root, which the `coverage` live kind invalidates. */
export const COVERAGE_KEY = COVERAGE_ROOT

export const coveragePlacesQuery = (q: string) =>
  queryOptions({
    queryKey: [...COVERAGE_ROOT, "places", q] as const,
    queryFn: () => searchCoveragePlaces(q),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
  })

function useCoverageMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate(qc) })
}
export const useAddCoveragePostcodes = () =>
  useCoverageMutation((b: AddCoveragePostcodesRequest) => addCoveragePostcodes(b))
export const usePatchCoveragePostcodes = () =>
  useCoverageMutation((b: PatchCoveragePostcodesRequest) => patchCoveragePostcodes(b))
export const useRemoveCoveragePostcode = () =>
  useCoverageMutation((postcode: string) => removeCoveragePostcode(postcode))
export const useCreateCoverageGroup = () => useCoverageMutation((name: string) => createCoverageGroup(name))
export const useRenameCoverageGroup = () =>
  useCoverageMutation((v: { id: string; name: string }) => renameCoverageGroup(v.id, v.name))
export const useRemoveCoverageGroup = () =>
  useCoverageMutation((v: { id: string; confirmNoDrivers: boolean }) => removeCoverageGroup(v.id, v.confirmNoDrivers))
export const useUpdateCourier = () => useCoverageMutation((change: CourierReachUpdateDTO) => updateCourier(change))
export const useAddCourierExclusion = () =>
  useCoverageMutation((v: { postcode: string; reason: string }) => addCourierExclusion(v.postcode, v.reason))
export const useRemoveCourierExclusion = () =>
  useCoverageMutation((postcode: string) => removeCourierExclusion(postcode))

export const courierServicesQuery = () =>
  queryOptions({ queryKey: ["delivery", "courier-services"] as const, queryFn: () => listCourierServices() })
export const useCreateCourierService = () => useCoverageMutation((b: CourierServiceInput) => createCourierService(b))
export const useUpdateCourierService = () =>
  useCoverageMutation((v: { id: string; body: CourierServiceInput }) => updateCourierService(v.id, v.body))

// going live with the new delivery model
