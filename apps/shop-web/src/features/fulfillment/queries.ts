import { keepPreviousData, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type { ShopOrderPicksRequest, TransitionRequest } from "@effy/shared-types"
import { toast } from "@effy/design-system/ui"

import { track } from "@/lib/telemetry"

import { courierHandoverError, fulfillmentMutationError } from "./errorText"
import type { FulfillmentStatus } from "./model"
import { toListQuery, type OrdersSearch } from "./orderConsole"
import {
  courierHandover,
  addOrderNote,
  declareParcels,
  packScanParcels,
  voidParcel,
  getOrder,
  listOrders,
  setOrderPicks,
  setOrderTags,
  transitionFulfillment,
} from "./repo"

const FULFILLMENT_ROOT = ["shop", "fulfillment"] as const

export const orderListQuery = (search: OrdersSearch) => {
  const q = toListQuery(search)
  return queryOptions({
    queryKey: [...FULFILLMENT_ROOT, "orders", "list", q] as const,
    queryFn: () => listOrders(q),
    placeholderData: keepPreviousData,
  })
}

export const orderDetailQuery = (id: string) =>
  queryOptions({
    queryKey: [...FULFILLMENT_ROOT, "orders", "detail", id] as const,
    queryFn: () => getOrder(id),
  })

export function invalidateOrders(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: FULFILLMENT_ROOT })
}

const TRANSITION_TOAST: Record<TransitionRequest["to"], string> = {
  picking: "Picking started",
  ready_for_pickup: "Marked ready for pickup",
  unfulfillable: "Marked can't supply - Effy will refund the customer",
}

export function useTransitionFulfillment(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ from: _from, ...body }: TransitionRequest & { from: FulfillmentStatus }) =>
      transitionFulfillment(id, body),
    onSuccess: (detail, { from, to }) => {
      const reversed = from === "ready_for_pickup" && to === "picking"
      if (reversed) track({ name: "shop_order_reversed", fulfillmentId: id })
      track({ name: "shop_order_state_changed", fulfillmentId: id, from, to: detail.status })
      toast.success(reversed ? "Picking reopened" : TRANSITION_TOAST[to], {
        description: detail.orderNumber,
      })
      invalidateOrders(queryClient)
    },
    onError: (err) => {
      toast.error(fulfillmentMutationError(err))
      invalidateOrders(queryClient)
    },
  })
}

export function useSetPicks(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { lines: ShopOrderPicksRequest["lines"]; toast: string }) =>
      setOrderPicks(id, { lines: args.lines }),
    onSuccess: (_detail, args) => {
      for (const l of args.lines) {
        track({
          name: l.mode === "unavailable" ? "shop_order_item_unavailable" : "shop_order_item_gathered",
          fulfillmentId: id,
        })
      }
      toast.success(args.toast)
      invalidateOrders(queryClient)
    },
    onError: (err) => {
      toast.error(fulfillmentMutationError(err))
      invalidateOrders(queryClient)
    },
  })
}

export function useSetOrderTags(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tags: string[]) => setOrderTags(id, tags),
    onSuccess: (detail) => {
      toast.success("Tags saved", { description: detail.orderNumber })
      invalidateOrders(queryClient)
    },
  })
}

export function useAddOrderNote(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => addOrderNote(id, body),
    onSuccess: (detail) => {
      toast.success("Note added", { description: detail.orderNumber })
      invalidateOrders(queryClient)
    },
  })
}

export function useCourierHandover(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => courierHandover(id),
    onSuccess: (detail) => {
      toast.success("Handed over to courier", { description: detail.orderNumber })
      invalidateOrders(queryClient)
    },
    onError: (err) => {
      toast.error(courierHandoverError(err))
      invalidateOrders(queryClient)
    },
  })
}

export function useDeclareParcels(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (counts: { ambient: number; chilled: number; frozen: number }) => declareParcels(id, counts),
    onSuccess: (d) => {
      toast.success(`${d.parcels.length} ${d.parcels.length === 1 ? "bag" : "bags"} ready to label`)
      track({ name: "parcels_declared", fulfillmentId: id, count: d.parcels.length })
      invalidateOrders(queryClient)
    },
    onError: () => invalidateOrders(queryClient),
  })
}

export function useVoidParcel(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (parcelId: string) => voidParcel(id, parcelId),
    onSuccess: () => {
      toast.success("Bag removed")
      invalidateOrders(queryClient)
    },
    onError: () => invalidateOrders(queryClient),
  })
}

export function usePackScan(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reads: Parameters<typeof packScanParcels>[1]) => packScanParcels(id, reads),
    onSuccess: () => {
      track({ name: "pack_scanned", fulfillmentId: id })
      invalidateOrders(queryClient)
    },
    onError: () => invalidateOrders(queryClient),
  })
}
