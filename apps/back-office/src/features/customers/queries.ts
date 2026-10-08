import { keepPreviousData, queryOptions, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import type { PointsCreditRequest, PointsDebitRequest, PointsSettingsDTO } from "@effy/shared-types";

import {
  creditPoints, debitPoints, getCustomer, getPointsHistory, getPointsSettings, searchCustomers, updatePointsSettings,
} from "./repo";

// Server state lives ONLY in the TanStack Query cache (Principle VI). Every key is under "customers",
// so the live `points` update (features/live/routes.ts) re-reads all of them at once.
export const customersKeys = {
  all: ["customers"] as const,
  search: (q: string) => ["customers", "search", q] as const,
  detail: (id: string) => ["customers", "detail", id] as const,
  history: (id: string) => ["customers", "history", id] as const,
  settings: ["customers", "points-settings"] as const,
};

export const customerSearchQuery = (q: string) =>
  queryOptions({
    queryKey: customersKeys.search(q),
    queryFn: () => searchCustomers(q),
    // The server finds nothing under three characters; asking would only flash an empty table.
    enabled: q.trim().length >= 3,
    placeholderData: keepPreviousData,
  });

export const customerDetailQuery = (id: string) =>
  queryOptions({ queryKey: customersKeys.detail(id), queryFn: () => getCustomer(id) });

export const pointsSettingsQuery = queryOptions({ queryKey: customersKeys.settings, queryFn: getPointsSettings });

export function usePointsHistory(id: string) {
  return useInfiniteQuery({
    queryKey: customersKeys.history(id),
    queryFn: ({ pageParam }) => getPointsHistory(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/**
 * ⚠ BOTH INVALIDATE THE CUSTOMER, NOT JUST THE HISTORY. A credit changes the balance line, the next
 * expiry and the search row; patching one of them would leave the others saying something else.
 */
export function useCreditPoints(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PointsCreditRequest) => creditPoints(customerId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: customersKeys.all }),
  });
}

export function useDebitPoints(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PointsDebitRequest) => debitPoints(customerId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: customersKeys.all }),
  });
}

export function useUpdatePointsSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<PointsSettingsDTO>) => updatePointsSettings(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: customersKeys.settings }),
  });
}
