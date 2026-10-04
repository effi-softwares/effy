import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type { ApproveReviewRequest, SendBackReviewRequest, SetMarginRequest } from "@effy/shared-types";

import { approve, getItem, listMarginNotSet, listQueue, sendBack, setMargin, type QueueParams } from "./repo";

// Server state lives ONLY in the TanStack Query cache (Principle VI). Every decision INVALIDATES the
// whole review tree rather than patching it: a decided item leaves the queue, may change the
// margin-not-set list, and its own detail no longer exists.

export const reviewKeys = {
  all: ["product-review"] as const,
  queue: (params: QueueParams) => ["product-review", "queue", params] as const,
  marginNotSet: ["product-review", "margin-not-set"] as const,
  item: (productId: string) => ["product-review", "item", productId] as const,
};

export const reviewQueueQuery = (params: QueueParams) =>
  queryOptions({ queryKey: reviewKeys.queue(params), queryFn: () => listQueue(params) });

export const marginNotSetQuery = (cursor: string | null = null) =>
  queryOptions({
    queryKey: [...reviewKeys.marginNotSet, cursor] as const,
    queryFn: () => listMarginNotSet(cursor),
  });

export const reviewItemQuery = (productId: string) =>
  queryOptions({
    queryKey: reviewKeys.item(productId),
    queryFn: () => getItem(productId),
    // ⚠ Never served stale. The item carries the VERSION a decision must echo, and a reviewer must
    // decide on what the shop has submitted NOW, not on what this tab remembered.
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
