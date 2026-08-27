import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type { RecordArrivalRequest, RecordHandoffRequest } from "@effy/shared-types";

import type { OrderListParams } from "./model";
import { getOrder, listOrders, recordArrival, recordHandoff } from "./repo";

// Server state lives ONLY in the TanStack Query cache (Principle VI) — never hand-cached in
// component state. The list query is keyed on its params so each filter/search combination caches
// independently; mutations invalidate rather than patch.

export const ordersKeys = {
  all: ["orders"] as const,
  list: (params: OrderListParams) => ["orders", "list", params] as const,
  detail: (orderId: string) => ["orders", "detail", orderId] as const,
};

export const ordersListQuery = (params: OrderListParams) =>
  queryOptions({
    queryKey: ordersKeys.list(params),
    queryFn: () => listOrders(params),
  });

export const orderDetailQuery = (orderId: string) =>
  queryOptions({
    queryKey: ordersKeys.detail(orderId),
    queryFn: () => getOrder(orderId),
  });

/**
 * ⚠ BOTH MUTATIONS INVALIDATE THE WHOLE ORDER, not just the package.
 *
 * Recording an arrival can finish the ORDER — which changes its stage, its `finished` flag, its
 * `awaiting`, and adds a history entry. Patching the one package in the cache would leave a detail
 * page showing a delivered package inside an order still labelled "on the way", which is exactly the
 * kind of silent disagreement 033 and 029 both produced by hand-maintaining derived state.
 */
export function useRecordHandoff(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { fulfillmentId: string; body: RecordHandoffRequest }) =>
      recordHandoff(v.fulfillmentId, v.body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ordersKeys.detail(orderId) });
      await qc.invalidateQueries({ queryKey: ordersKeys.all });
    },
  });
}

export function useRecordArrival(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { fulfillmentId: string; body: RecordArrivalRequest }) =>
      recordArrival(v.fulfillmentId, v.body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ordersKeys.detail(orderId) });
      await qc.invalidateQueries({ queryKey: ordersKeys.all });
    },
  });
}
