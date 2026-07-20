import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type { ItemProgressRequest, TransitionRequest } from "@effy/shared-types";

import { track } from "@/lib/telemetry";

import type { FulfillmentQueueState } from "./model";
import {
  getFulfillment,
  listFulfillments,
  transitionFulfillment,
  updateItemProgress,
} from "./repo";

// Server state lives ONLY in the TanStack Query cache (Principle VI). Every mutation here returns
// the updated portion, and every one of them INVALIDATES rather than patching the cache — this
// repo's rule, and doubly right here: a fulfillment portion is shared work. Two operators can act on
// the same order at once (FR-014), so a hand-patched cache would be a second, immediately-wrong
// source of truth. Re-reading is the only honest answer.

const FULFILLMENT_ROOT = ["shop", "fulfillment"] as const;

/**
 * The queue (US1/US4) — POLLED.
 *
 * This is the monorepo's FIRST polling query (research R8). SC-001 requires a newly placed order to
 * be visible to the shop without the operator navigating away, so a 15s interval bounds worst-case
 * latency well inside the 30s target while staying cheap for a console left open all shift.
 *
 * `refetchIntervalInBackground: false` is the load-bearing half: a shop tablet is left open on a
 * bench for hours, and polling a hidden tab would bill the platform for reads nobody is looking at.
 * Focus refetch (the Query default) covers the moment the operator comes back.
 *
 * The `state` is part of the key, so active and completed cache — and poll — independently.
 */
export const fulfillmentQueueQuery = (state: FulfillmentQueueState) =>
  queryOptions({
    queryKey: [...FULFILLMENT_ROOT, "queue", state] as const,
    queryFn: () => listFulfillments(state),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

/**
 * One portion's pick screen (US2).
 *
 * Not polled: the operator is ACTING on this screen, and a background refetch mid-edit is a worse
 * experience than a stale read. Every write invalidates it, so it is never stale after our own
 * action, and the queue's poll surfaces anyone else's.
 */
export const fulfillmentDetailQuery = (id: string) =>
  queryOptions({
    queryKey: [...FULFILLMENT_ROOT, "detail", id] as const,
    queryFn: () => getFulfillment(id),
  });

/** Invalidate BOTH queue slices — a transition moves a portion between active and completed. */
function invalidateQueue(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: [...FULFILLMENT_ROOT, "queue"] });
}

function invalidateDetail(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  void queryClient.invalidateQueries({ queryKey: [...FULFILLMENT_ROOT, "detail", id] });
}

/**
 * Advance or reverse the portion (US3).
 *
 * A 409 means the requested transition is not legal from the state the server actually holds — the
 * portion moved under us. The screen surfaces that as a RELOAD affordance (see `errorText`), never a
 * retry: retrying would re-submit a decision made against a state that no longer exists.
 */
export function useTransitionFulfillment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TransitionRequest) => transitionFulfillment(id, body),
    onSuccess: (detail, body) => {
      // A reversal is tracked distinctly: it is the only backward edge in the machine, so it is the
      // signal that an order was completed prematurely (FR-011e).
      if (body.to === "picking" && detail.status === "picking") {
        track({ name: "shop_order_reversed", fulfillmentId: id });
      }
      track({ name: "shop_order_state_changed", fulfillmentId: id, from: body.to, to: detail.status });
      invalidateDetail(queryClient, id);
      invalidateQueue(queryClient);
    },
  });
}

/**
 * Record progress / shortfall on one line (US2). Absolute quantities, so a retry is idempotent.
 * Invalidates the queue too — the queue row carries `gatheredCount`/`unavailableCount`.
 */
export function useUpdateItemProgress(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { orderItemId: string; body: ItemProgressRequest }) =>
      updateItemProgress(id, args.orderItemId, args.body),
    onSuccess: (_detail, args) => {
      // No quantity and no product name in the props — a shortfall is an unresolved obligation to a
      // specific customer and belongs in the operational record, not in product analytics.
      if (args.body.gatheredQuantity !== undefined) {
        track({ name: "shop_order_item_gathered", fulfillmentId: id });
      }
      if (args.body.unavailableQuantity !== undefined) {
        track({
          name: args.body.unavailableQuantity > 0
            ? "shop_order_item_unavailable"
            : "shop_order_item_restored",
          fulfillmentId: id,
        });
      }
      invalidateDetail(queryClient, id);
      invalidateQueue(queryClient);
    },
  });
}
