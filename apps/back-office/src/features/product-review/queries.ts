import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type { ApproveReviewRequest, SendBackReviewRequest, SetMarginRequest } from "@effy/shared-types"

import {
  approve,
  getItem,
  listGstMissing,
  listMarginNotSet,
  listQueue,
  sendBack,
  setGstBulk,
  setMargin,
  type QueueParams,
} from "./repo"

const reviewKeys = {
  all: ["product-review"] as const,
  queue: (params: QueueParams) => ["product-review", "queue", params] as const,
  marginNotSet: ["product-review", "margin-not-set"] as const,
  gstMissing: ["product-review", "gst-missing"] as const,
  item: (productId: string) => ["product-review", "item", productId] as const,
}

export const reviewQueueQuery = (params: QueueParams) =>
  queryOptions({ queryKey: reviewKeys.queue(params), queryFn: () => listQueue(params) })

export const marginNotSetQuery = (cursor: string | null = null) =>
  queryOptions({
    queryKey: [...reviewKeys.marginNotSet, cursor] as const,
    queryFn: () => listMarginNotSet(cursor),
  })

export const gstMissingQuery = () => queryOptions({ queryKey: reviewKeys.gstMissing, queryFn: listGstMissing })

export function useSetGstBulk() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: setGstBulk,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: reviewKeys.gstMissing }),
  })
}

export const reviewItemQuery = (productId: string) =>
  queryOptions({
    queryKey: reviewKeys.item(productId),
    queryFn: () => getItem(productId),
    staleTime: 0,
    gcTime: 0,
  })

export function useApprove(productId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ApproveReviewRequest) => approve(productId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.all }),
  })
}

export function useSendBack(productId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SendBackReviewRequest) => sendBack(productId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.all }),
  })
}

export function useSetMargin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { productId: string; body: SetMarginRequest }) => setMargin(v.productId, v.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.all }),
  })
}
