import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type { ApproveReviewRequest, SendBackReviewRequest, SetMarginRequest } from "@effy/shared-types"

import {
  approve,
  getItem,
  listMarginNotSet,
  listMissingDetails,
  setPlacements,
  listQueue,
  sendBack,
  setMargin,
  type QueueParams,
} from "./repo"

const reviewKeys = {
  all: ["product-review"] as const,
  queue: (params: QueueParams) => ["product-review", "queue", params] as const,
  marginNotSet: ["product-review", "margin-not-set"] as const,
  item: (productId: string) => ["product-review", "item", productId] as const,
  missingDetails: ["product-review", "missing-details"] as const,
}

export const reviewQueueQuery = (params: QueueParams) =>
  queryOptions({ queryKey: reviewKeys.queue(params), queryFn: () => listQueue(params) })

export const marginNotSetQuery = (cursor: string | null = null) =>
  queryOptions({
    queryKey: [...reviewKeys.marginNotSet, cursor] as const,
    queryFn: () => listMarginNotSet(cursor),
  })

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
    // Catalogue › Products shows the margin too (102).
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: reviewKeys.all }),
        qc.invalidateQueries({ queryKey: ["products"] }),
      ]),
  })
}

export const missingDetailsQuery = (cursor: string | null = null) =>
  queryOptions({ queryKey: [...reviewKeys.missingDetails, cursor] as const, queryFn: () => listMissingDetails(cursor) })

export function useSetPlacements(productId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (categoryIds: string[]) => setPlacements(productId, categoryIds),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: reviewKeys.item(productId) }),
        qc.invalidateQueries({ queryKey: ["products", "detail", productId] }),
      ]),
  })
}
