import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type { AdminPromotionWriteDTO, PromotionAction } from "@effy/shared-types";

import type { PromotionListParams, UpdateOrderPolicyRequest } from "./model";
import {
  actOnPromotion,
  createPromotion,
  deletePromotion,
  getOrderPolicy,
  getPromotion,
  getPromotionHistory,
  listPromotions,
  putOrderPolicy,
  updatePromotion,
  addChosenCustomers,
  generateCodes,
  getPerformance,
  listChosenCustomers,
  listCodes,
  removeChosenCustomer,
} from "./repo";

// Server state lives ONLY in the TanStack Query cache (Principle VI). Mutations invalidate the root
// rather than patch the cache — a promotion's state and uses move without us touching them.

export const PROMO_ROOT = ["back-office", "promotions"] as const;

export const promotionListQuery = (params: PromotionListParams) =>
  queryOptions({ queryKey: [...PROMO_ROOT, "list", params] as const, queryFn: () => listPromotions(params) });

export const promotionQuery = (id: string) =>
  queryOptions({ queryKey: [...PROMO_ROOT, "detail", id] as const, queryFn: () => getPromotion(id) });

export const promotionHistoryQuery = (id: string) =>
  queryOptions({ queryKey: [...PROMO_ROOT, "history", id] as const, queryFn: () => getPromotionHistory(id) });

export const orderPolicyQuery = () => queryOptions({ queryKey: [...PROMO_ROOT, "order-policy"] as const, queryFn: () => getOrderPolicy() });

function useInvalidating<A, R>(fn: (a: A) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => void queryClient.invalidateQueries({ queryKey: PROMO_ROOT }) });
}

export const useCreatePromotion = () => useInvalidating((body: AdminPromotionWriteDTO) => createPromotion(body));
export const useUpdatePromotion = (id: string) => useInvalidating((body: Partial<AdminPromotionWriteDTO>) => updatePromotion(id, body));
export const usePromotionAction = (id: string) => useInvalidating((action: PromotionAction) => actOnPromotion(id, { action }));
export const useDeletePromotion = () => useInvalidating((id: string) => deletePromotion(id));
export const useUpdateOrderPolicy = () => useInvalidating((body: UpdateOrderPolicyRequest) => putOrderPolicy(body));

export const chosenCustomersQuery = (id: string, page: number) =>
  queryOptions({ queryKey: [...PROMO_ROOT, "customers", id, page] as const, queryFn: () => listChosenCustomers(id, page) });
export const codesQuery = (id: string, page: number, state?: string) =>
  queryOptions({ queryKey: [...PROMO_ROOT, "codes", id, page, state ?? ""] as const, queryFn: () => listCodes(id, page, state) });
export const performanceQuery = (id: string) => queryOptions({ queryKey: [...PROMO_ROOT, "performance", id] as const, queryFn: () => getPerformance(id) });

export const useAddChosenCustomers = (id: string) => useInvalidating((body: { emails?: string[]; customerIds?: string[] }) => addChosenCustomers(id, body));
export const useRemoveChosenCustomer = (id: string) => useInvalidating((customerId: string) => removeChosenCustomer(id, customerId));
export const useGenerateCodes = (id: string) => useInvalidating((body: { count: number; prefix?: string | null }) => generateCodes(id, body));
