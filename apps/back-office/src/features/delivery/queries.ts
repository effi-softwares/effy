import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  AddPostcodesRequest,
  CreateOfferingRequest,
  CreateZoneRequest,
  SetShopLocationRequest,
  UpdateOfferingRequest,
  UpdateZoneRequest,
} from "@effy/shared-types";

import {
  addPostcodes,
  createOffering,
  createZone,
  getZoneHistory,
  getZonePostcodes,
  listOfferings,
  listShopOptions,
  listZones,
  removePostcode,
  setShopLocation,
  updateOffering,
  updateZone,
} from "./repo";
import type { OfferingListParams, ZoneListParams } from "./model";

// Server state lives ONLY in the TanStack Query cache (Principle VI). List queries are keyed on their
// params so each page/filter combination caches independently; mutations invalidate the affected
// roots rather than hand-patching cached data.

const DELIVERY_ROOT = ["back-office", "delivery"] as const;

export const zoneListQuery = (params: ZoneListParams) =>
  queryOptions({
    queryKey: [...DELIVERY_ROOT, "zones", "list", params] as const,
    queryFn: () => listZones(params),
  });

export const zonePostcodesQuery = (id: string, page: number, pageSize: number) =>
  queryOptions({
    queryKey: [...DELIVERY_ROOT, "zones", "postcodes", id, page, pageSize] as const,
    queryFn: () => getZonePostcodes(id, page, pageSize),
  });

export const zoneHistoryQuery = (id: string, page: number, pageSize: number) =>
  queryOptions({
    queryKey: [...DELIVERY_ROOT, "zones", "history", id, page, pageSize] as const,
    queryFn: () => getZoneHistory(id, page, pageSize),
  });

export const offeringListQuery = (params: OfferingListParams) =>
  queryOptions({
    queryKey: [...DELIVERY_ROOT, "offerings", "list", params] as const,
    queryFn: () => listOfferings(params),
  });

export const shopOptionsQuery = () =>
  queryOptions({
    queryKey: [...DELIVERY_ROOT, "shop-options"] as const,
    queryFn: () => listShopOptions(),
  });

// Coarse invalidation of the whole delivery root — counts, postcodes and history all move after a
// write, so a single invalidation is correct and cheap here.
function invalidateDelivery(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: DELIVERY_ROOT });
}

export function useCreateZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateZoneRequest) => createZone(body),
    onSuccess: () => invalidateDelivery(queryClient),
  });
}

export function useUpdateZone(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateZoneRequest) => updateZone(id, body),
    onSuccess: () => invalidateDelivery(queryClient),
  });
}

export function useAddPostcodes(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AddPostcodesRequest) => addPostcodes(id, body),
    onSuccess: () => invalidateDelivery(queryClient),
  });
}

export function useRemovePostcode(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postcode: string) => removePostcode(id, postcode),
    onSuccess: () => invalidateDelivery(queryClient),
  });
}

export function useCreateOffering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOfferingRequest) => createOffering(body),
    onSuccess: () => invalidateDelivery(queryClient),
  });
}

export function useUpdateOffering(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateOfferingRequest) => updateOffering(id, body),
    onSuccess: () => invalidateDelivery(queryClient),
  });
}

export function useSetShopLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shopId, body }: { shopId: string; body: SetShopLocationRequest }) =>
      setShopLocation(shopId, body),
    onSuccess: () => invalidateDelivery(queryClient),
  });
}
