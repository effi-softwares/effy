import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type { ApproveReviewRequest, SendBackReviewRequest, SetMarginRequest } from "@effy/shared-types";

import { approve, getItem, listGstMissing, listMarginNotSet, listQueue, sendBack, setGstBulk, setMargin, type QueueParams } from "./repo";

// Server state lives only in the TanStack Query cache (Principle VI). Every decision invalidates the
// whole review tree rather than patching it: a decided item leaves the queue, may change the
// margin-not-set list, and its own detail no longer exists.

export const reviewKeys = {
  all: ["product-review"] as const,
  queue: (params: QueueParams) => ["product-review", "queue", params] as const,
  marginNotSet: ["product-review", "margin-not-set"] as const,
  gstMissing: ["product-review", "gst-missing"] as const,
  item: (productId: string) => ["product-review", "item", productId] as const,
};

export const reviewQueueQuery = (params: QueueParams) =>
  queryOptions({ queryKey: reviewKeys.queue(params), queryFn: () => listQueue(params) });

export const marginNotSetQuery = (cursor: string | null = null) =>
  queryOptions({
    queryKey: [...reviewKeys.marginNotSet, cursor] as const,
    queryFn: () => listMarginNotSet(cursor),
  });

/** Live products with no GST status. */
export const gstMissingQuery = () => queryOptions({ queryKey: reviewKeys.gstMissing, queryFn: listGstMissing });

export function useSetGstBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setGstBulk,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: reviewKeys.gstMissing }),
  });
}

export const reviewItemQuery = (productId: string) =>
  queryOptions({
    queryKey: reviewKeys.item(productId),
    queryFn: () => getItem(productId),
    // Never served stale. The item carries the version a decision must echo, and a reviewer must
    // decide on what the shop has submitted now, not on what this tab remembered.
    staleTime: 0,
    gcTime: 0,
  });

export function useApprove(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ApproveReviewRequest) => approve(productId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.all }),
  });
}

export function useSendBack(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SendBackReviewRequest) => sendBack(productId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.all }),
  });
}

export function useSetMargin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { productId: string; body: SetMarginRequest }) => setMargin(v.productId, v.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.all }),
  });
}
