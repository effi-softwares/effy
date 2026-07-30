import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  CreatePromoCodeRequest,
  SetPromoStatusRequest,
  UpdateOrderPolicyRequest,
  UpdatePromoCodeRequest,
} from "@effy/shared-types";

import type { PromoListParams } from "./model";
import {
  createPromo,
  deletePromo,
  getOrderPolicy,
  getPromo,
  getPromoHistory,
  listPromos,
  putOrderPolicy,
  setPromoStatus,
  updatePromo,
} from "./repo";

// Server state lives ONLY in the TanStack Query cache (Principle VI). List queries are keyed on their
// params so each page/filter combination caches independently; mutations invalidate the affected root
// rather than hand-patching cached data — a code's redemption count moves without us touching it, so
// patching the cache would show a number the platform never said.

const PROMO_ROOT = ["back-office", "promotions"] as const;

export const promoListQuery = (params: PromoListParams) =>
  queryOptions({
    queryKey: [...PROMO_ROOT, "list", params] as const,
    queryFn: () => listPromos(params),
  });

export const promoDetailQuery = (id: string) =>
  queryOptions({
    queryKey: [...PROMO_ROOT, "detail", id] as const,
    queryFn: () => getPromo(id),
  });

export const promoHistoryQuery = (id: string) =>
  queryOptions({
    queryKey: [...PROMO_ROOT, "history", id] as const,
    queryFn: () => getPromoHistory(id),
  });

export const orderPolicyQuery = () =>
  queryOptions({
    queryKey: [...PROMO_ROOT, "order-policy"] as const,
    queryFn: () => getOrderPolicy(),
  });

function invalidatePromotions(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: PROMO_ROOT });
}

export function useCreatePromo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePromoCodeRequest) => createPromo(body),
    onSuccess: () => invalidatePromotions(queryClient),
  });
}

export function useUpdatePromo(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePromoCodeRequest) => updatePromo(id, body),
    onSuccess: () => invalidatePromotions(queryClient),
  });
}

export function useSetPromoStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SetPromoStatusRequest) => setPromoStatus(id, body),
    onSuccess: () => invalidatePromotions(queryClient),
  });
}

export function useDeletePromo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePromo(id),
    onSuccess: () => invalidatePromotions(queryClient),
  });
}

export function useUpdateOrderPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateOrderPolicyRequest) => putOrderPolicy(body),
    onSuccess: () => invalidatePromotions(queryClient),
  });
}
