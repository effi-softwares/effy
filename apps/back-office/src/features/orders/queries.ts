import { keepPreviousData, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type {
  ConsignmentEventInput,
  ConsignmentInput,
  CourierCollectionInput,
  CourierView,
  DeliveryMoveRequest,
  DeliveryType,
  RecordArrivalRequest,
  RecordHandoffRequest,
} from "@effy/shared-types"

import type { OrderListParams } from "./model"
import {
  changeCourierCollection,
  getOrder,
  getOrdersToday,
  getOrderViewCounts,
  listOrders,
  changeDeliveryWindow,
  moveDelivery,
  previewDeliveryMove,
  recordArrival,
  recordConsignmentStep,
  recordHandoff,
  saveConsignment,
} from "./repo"

export const ordersKeys = {
  all: ["orders"] as const,
  list: (params: OrderListParams) => ["orders", "list", params] as const,
  detail: (orderId: string) => ["orders", "detail", orderId] as const,
  // Under "orders" too: every consignment change invalidates `ordersKeys.all`.
  courier: (view: CourierView) => ["orders", "courier", view] as const,
  // Under "orders" too: a move (or any order change) makes a preview stale.
  deliveryMove: (orderId: string, to: DeliveryType) => ["orders", "delivery-move", orderId, to] as const,
}

export const deliveryMovePreviewQuery = (orderId: string, to: DeliveryType) =>
  queryOptions({
    queryKey: ordersKeys.deliveryMove(orderId, to),
    queryFn: () => previewDeliveryMove(orderId, to),
    staleTime: 0,
  })

function useOrderMutation<V, R>(orderId: string, fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ordersKeys.detail(orderId) })
      await qc.invalidateQueries({ queryKey: ordersKeys.all })
    },
  })
}
export const useSaveConsignment = (orderId: string) =>
  useOrderMutation(orderId, (v: { fulfillmentId: string; body: ConsignmentInput }) =>
    saveConsignment(v.fulfillmentId, v.body),
  )
export const useConsignmentStep = (orderId: string) =>
  useOrderMutation(orderId, (v: { fulfillmentId: string; body: ConsignmentEventInput }) =>
    recordConsignmentStep(v.fulfillmentId, v.body),
  )
export const useDeliveryMove = (orderId: string) =>
  useOrderMutation(orderId, (body: DeliveryMoveRequest) => moveDelivery(orderId, body))
export const useChangeDeliveryWindow = (orderId: string) =>
  useOrderMutation(orderId, (body: Parameters<typeof changeDeliveryWindow>[1]) => changeDeliveryWindow(orderId, body))
export const useCourierCollection = (orderId: string) =>
  useOrderMutation(orderId, (body: CourierCollectionInput) => changeCourierCollection(orderId, body))

export const orderViewCountsQuery = (params: OrderListParams) =>
  queryOptions({
    queryKey: [...ordersKeys.all, "views", params] as const,
    queryFn: () => getOrderViewCounts(params),
    placeholderData: keepPreviousData,
  })

export const ordersTodayQuery = () =>
  queryOptions({ queryKey: [...ordersKeys.all, "today"] as const, queryFn: getOrdersToday })

export const ordersListQuery = (params: OrderListParams) =>
  queryOptions({
    queryKey: ordersKeys.list(params),
    queryFn: () => listOrders(params),
  })

export const orderDetailQuery = (orderId: string) =>
  queryOptions({
    queryKey: ordersKeys.detail(orderId),
    queryFn: () => getOrder(orderId),
  })

export function useRecordHandoff(orderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { fulfillmentId: string; body: RecordHandoffRequest }) => recordHandoff(v.fulfillmentId, v.body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ordersKeys.detail(orderId) })
      await qc.invalidateQueries({ queryKey: ordersKeys.all })
    },
  })
}

export function useRecordArrival(orderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { fulfillmentId: string; body: RecordArrivalRequest }) => recordArrival(v.fulfillmentId, v.body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ordersKeys.detail(orderId) })
      await qc.invalidateQueries({ queryKey: ordersKeys.all })
    },
  })
}
