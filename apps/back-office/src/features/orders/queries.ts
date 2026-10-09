import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  ConsignmentEventInput, ConsignmentInput, CourierCollectionInput, CourierView, DeliveryMoveRequest, DeliveryType, HandoverDueFilter,
  RecordArrivalRequest, RecordHandoffRequest,
} from "@effy/shared-types";

import type { OrderListParams } from "./model";
import {
  changeCourierCollection, getOrder, listCourierParcels, listHandovers, listOrders, moveDelivery, previewDeliveryMove, recordArrival,
  recordConsignmentStep, recordHandoff, saveConsignment,
} from "./repo";

// Server state lives ONLY in the TanStack Query cache (Principle VI) — never hand-cached in
// component state. The list query is keyed on its params so each filter/search combination caches
// independently; mutations invalidate rather than patch.

export const ordersKeys = {
  all: ["orders"] as const,
  list: (params: OrderListParams) => ["orders", "list", params] as const,
  detail: (orderId: string) => ["orders", "detail", orderId] as const,
  // ⚠ Under the "orders" root ON PURPOSE: recording a handover invalidates `ordersKeys.all`, and a
  // package just handed over must leave this list too.
  handovers: (due: HandoverDueFilter) => ["orders", "handovers", due] as const,
  // 080 — under "orders" too: every consignment change invalidates `ordersKeys.all`.
  courier: (view: CourierView) => ["orders", "courier", view] as const,
  // 081 — under "orders" too: a move (or any order change) makes a preview stale.
  deliveryMove: (orderId: string, to: DeliveryType) => ["orders", "delivery-move", orderId, to] as const,
};

/** 081 — read only while its dialog is open: a preview is a moment's figures, not a page's. */
export const deliveryMovePreviewQuery = (orderId: string, to: DeliveryType, enabled: boolean) =>
  queryOptions({
    queryKey: ordersKeys.deliveryMove(orderId, to),
    queryFn: () => previewDeliveryMove(orderId, to),
    enabled,
    staleTime: 0,
  });

export const courierParcelsQuery = (view: CourierView) =>
  queryOptions({ queryKey: ordersKeys.courier(view), queryFn: () => listCourierParcels(view) });

/** 080 — every consignment change invalidates the whole order and every Courier-tab view. */
function useOrderMutation<V, R>(orderId: string, fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ordersKeys.detail(orderId) });
      await qc.invalidateQueries({ queryKey: ordersKeys.all });
    },
  });
}
export const useSaveConsignment = (orderId: string) =>
  useOrderMutation(orderId, (v: { fulfillmentId: string; body: ConsignmentInput }) => saveConsignment(v.fulfillmentId, v.body));
export const useConsignmentStep = (orderId: string) =>
  useOrderMutation(orderId, (v: { fulfillmentId: string; body: ConsignmentEventInput }) => recordConsignmentStep(v.fulfillmentId, v.body));
/** 081 — moving the order invalidates the order and every list it is on (the preview too: under "orders"). */
export const useDeliveryMove = (orderId: string) =>
  useOrderMutation(orderId, (body: DeliveryMoveRequest) => moveDelivery(orderId, body));
export const useCourierCollection = (orderId: string) =>
  useOrderMutation(orderId, (body: CourierCollectionInput) => changeCourierCollection(orderId, body));

export const handoversQuery = (due: HandoverDueFilter) =>
  queryOptions({ queryKey: ordersKeys.handovers(due), queryFn: () => listHandovers(due) });

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
