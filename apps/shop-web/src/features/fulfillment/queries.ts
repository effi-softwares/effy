import { keepPreviousData, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type { ItemProgressRequest, TransitionRequest } from "@effy/shared-types";
import { toast } from "@effy/design-system/ui";

import { track } from "@/lib/telemetry";

import { fulfillmentMutationError } from "./errorText";
import type { FulfillmentQueueState, FulfillmentStatus } from "./model";
import { toListQuery, type OrdersSearch } from "./orderConsole";
import {
  addOrderNote,
  getFulfillment,
  getOrder,
  getOrderActivity,
  listFulfillments,
  listOrders,
  setOrderTags,
  transitionFulfillment,
  updateItemProgress,
} from "./repo";

// Server state lives ONLY in the TanStack Query cache (Principle VI). Every mutation here returns
// the updated portion, and every one of them INVALIDATES rather than patching the cache — this
// repo's rule, and doubly right here: a fulfillment portion is shared work. Two operators can act on
// the same order at once (FR-014), so a hand-patched cache would be a second, immediately-wrong
// source of truth. Re-reading is the only honest answer.
//
// ⚠ 057 A3 — EVERY MUTATION ALSO SAYS SO. Each one appends to the order's activity log on the server
// and raises a confirmation toast here, so an operator never has to wonder whether a tap landed. The
// toast lives in the hook rather than the screen so that no call site can forget it.

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
 *
 * ⚠ 057 A3 — still read by the dashboard and the nav badge. The Orders screen now reads
 * `orderListQuery` instead.
 */
export const fulfillmentQueueQuery = (state: FulfillmentQueueState) =>
  queryOptions({
    queryKey: [...FULFILLMENT_ROOT, "queue", state] as const,
    queryFn: () => listFulfillments(state),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

/** One portion's pick read (US2). Not polled: the operator is acting on it. */
export const fulfillmentDetailQuery = (id: string) =>
  queryOptions({
    queryKey: [...FULFILLMENT_ROOT, "detail", id] as const,
    queryFn: () => getFulfillment(id),
  });

// ── 057 A3 — the order console ──────────────────────────────────────────────────────────────────

/**
 * The Orders list — polled like the queue it replaced (SC-001: a new order appears without the
 * operator navigating), and keyed on the normalised search so two URLs for one list share an entry.
 *
 * `placeholderData: keepPreviousData` keeps the current page on screen while the next one loads, so a
 * filter change does not flash the table empty and shift the operator's place.
 */
export const orderListQuery = (search: OrdersSearch) => {
  const q = toListQuery(search);
  return queryOptions({
    queryKey: [...FULFILLMENT_ROOT, "orders", "list", q] as const,
    queryFn: () => listOrders(q),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });
};

/** One order in the console. Not polled — every write invalidates it. */
export const orderDetailQuery = (id: string) =>
  queryOptions({
    queryKey: [...FULFILLMENT_ROOT, "orders", "detail", id] as const,
    queryFn: () => getOrder(id),
  });

/** The order's full history — read when the Activity sheet opens. */
export const orderActivityQuery = (id: string) =>
  queryOptions({
    queryKey: [...FULFILLMENT_ROOT, "orders", "activity", id] as const,
    queryFn: () => getOrderActivity(id),
  });

/**
 * ⚠ ONE INVALIDATION FOR EVERY WRITE: the whole fulfilment root. A transition changes the pick read,
 * the queue, the list's counts, the order detail AND its log; invalidating a hand-picked subset is how
 * one of those stays stale. Only mounted queries refetch, so the breadth costs nothing off-screen.
 */
export function invalidateOrders(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: FULFILLMENT_ROOT });
}

const TRANSITION_TOAST: Record<TransitionRequest["to"], string> = {
  picking: "Picking started",
  ready_for_pickup: "Marked ready for pickup",
  unfulfillable: "Marked can't supply — Effy will refund the customer",
};

/**
 * Advance or reverse the portion (US3).
 *
 * A 409 means the requested transition is not legal from the state the server actually holds — the
 * portion moved under us. The failure is invalidated straight away so the screen re-reads the truth
 * and re-derives its actions; it is never retried, which would re-submit a decision made against a
 * state that no longer exists.
 */
export function useTransitionFulfillment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // ⚠ `from` is the state the operator ACTED ON, sent nowhere — it is what tells a reversal apart
    // from a first start. The previous version inferred it from the result and tracked every
    // "Start picking" as a reversal, because both land in `picking`.
    mutationFn: ({ from: _from, ...body }: TransitionRequest & { from: FulfillmentStatus }) =>
      transitionFulfillment(id, body),
    onSuccess: (detail, { from, to }) => {
      const reversed = from === "ready_for_pickup" && to === "picking";
      // A reversal is tracked distinctly: it is the only backward edge in the machine, so it is the
      // signal that an order was completed prematurely (FR-011e).
      if (reversed) track({ name: "shop_order_reversed", fulfillmentId: id });
      track({ name: "shop_order_state_changed", fulfillmentId: id, from, to: detail.status });
      toast.success(reversed ? "Picking reopened" : TRANSITION_TOAST[to], {
        description: detail.orderNumber,
      });
      invalidateOrders(queryClient);
    },
    onError: (err) => {
      toast.error(fulfillmentMutationError(err));
      invalidateOrders(queryClient);
    },
  });
}

/**
 * Record progress / shortfall on one line (US2). Absolute quantities, so a retry is idempotent.
 * `label` is the line's name, carried only so the toast can say which line moved.
 */
export function useUpdateItemProgress(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { orderItemId: string; body: ItemProgressRequest; label?: string; ordered?: number }) =>
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
      const name = args.label ?? "Item";
      if (args.body.unavailableQuantity !== undefined) {
        toast.success(
          args.body.unavailableQuantity > 0
            ? `${name}: ${args.body.unavailableQuantity} marked unavailable`
            : `${name}: found — no longer short`,
        );
      } else if (args.body.gatheredQuantity !== undefined) {
        toast.success(
          args.ordered !== undefined
            ? `${name}: ${args.body.gatheredQuantity} of ${args.ordered} picked`
            : `${name}: ${args.body.gatheredQuantity} picked`,
        );
      }
      invalidateOrders(queryClient);
    },
    onError: (err) => {
      toast.error(fulfillmentMutationError(err));
    },
  });
}

/** Replace the order's tag set (A3). */
export function useSetOrderTags(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tags: string[]) => setOrderTags(id, tags),
    onSuccess: (detail) => {
      toast.success("Tags saved", { description: detail.orderNumber });
      invalidateOrders(queryClient);
    },
  });
}

/** Add an internal note (A3). */
export function useAddOrderNote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addOrderNote(id, body),
    onSuccess: (detail) => {
      toast.success("Note added", { description: detail.orderNumber });
      invalidateOrders(queryClient);
    },
  });
}
