import { keepPreviousData, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type { ShopOrderPicksRequest, TransitionRequest } from "@effy/shared-types";
import { toast } from "@effy/design-system/ui";

import { track } from "@/lib/telemetry";

import { courierHandoverError, fulfillmentMutationError } from "./errorText";
import type { FulfillmentQueueState, FulfillmentStatus } from "./model";
import { toListQuery, type OrdersSearch } from "./orderConsole";
import {
  courierHandover,
  addOrderNote,
  declareParcels,
  packScanParcels,
  voidParcel,
  getFulfillment,
  getOrder,
  getOrderActivity,
  listFulfillments,
  listOrders,
  setOrderPicks,
  setOrderTags,
  transitionFulfillment,
} from "./repo";

// Every mutation invalidates rather than patching the cache: a portion is shared work, and two
// operators can act on one order at once. Each also appends to the order's activity log on the server
// and raises a toast here, in the hook so no call site can forget it.

const FULFILLMENT_ROOT = ["shop", "fulfillment"] as const;

/**
 * The queue (read by the dashboard and the nav badge; Orders reads `orderListQuery`). Re-read when the
 * platform says this shop's orders changed (`features/live/routes.ts`), on returning to the tab, and on
 * action. The `state` is part of the key.
 */
export const fulfillmentQueueQuery = (state: FulfillmentQueueState) =>
  queryOptions({
    queryKey: [...FULFILLMENT_ROOT, "queue", state] as const,
    queryFn: () => listFulfillments(state),
  });

/** One portion's pick read. Re-read on a live `orders` update — a colleague's pick shows. */
export const fulfillmentDetailQuery = (id: string) =>
  queryOptions({
    queryKey: [...FULFILLMENT_ROOT, "detail", id] as const,
    queryFn: () => getFulfillment(id),
  });

// 057 A3 — the order console

/**
 * The Orders list — re-read on a live `orders` update, so a new order appears without the
 * operator navigating; keyed on the normalised search so two URLs for one list share an entry.
 *
 * `placeholderData: keepPreviousData` keeps the current page on screen while the next one loads, so a
 * filter change does not flash the table empty and shift the operator's place.
 */
export const orderListQuery = (search: OrdersSearch) => {
  const q = toListQuery(search);
  return queryOptions({
    queryKey: [...FULFILLMENT_ROOT, "orders", "list", q] as const,
    queryFn: () => listOrders(q),
    placeholderData: keepPreviousData,
  });
};

/** One order in the console. Every write invalidates it, and so does a live `orders` update. */
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
 * One invalidation for every write: the whole fulfilment root. A transition changes the pick read,
 * the queue, the list's counts, the order detail and its log; invalidating a hand-picked subset is how
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

/** Advance or reverse the portion. A 409 is invalidated at once so the screen re-derives from the truth; never retried. */
export function useTransitionFulfillment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // `from` is the state the operator acted on, sent nowhere — it is what tells a reversal apart
    // from a first start. The previous version inferred it from the result and tracked every
    // "Start picking" as a reversal, because both land in `picking`.
    mutationFn: ({ from: _from, ...body }: TransitionRequest & { from: FulfillmentStatus }) =>
      transitionFulfillment(id, body),
    onSuccess: (detail, { from, to }) => {
      const reversed = from === "ready_for_pickup" && to === "picking";
      // A reversal is tracked distinctly: it is the only backward edge in the machine, so it is the
      // signal that an order was completed prematurely.
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
 * Item-level picking (A3 revision 2) — a tick, "Select all" / "Clear all", or "Adjust this line".
 *
 * `toast` is the confirmation the caller wants said ("Eggs — picked in full"); the server writes the
 * matching log entry in the same transaction as the counts.
 */
export function useSetPicks(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { lines: ShopOrderPicksRequest["lines"]; toast: string }) =>
      setOrderPicks(id, { lines: args.lines }),
    onSuccess: (_detail, args) => {
      // No product name and no quantity in the props — the operational record is the log.
      for (const l of args.lines) {
        track({
          name: l.mode === "unavailable" ? "shop_order_item_unavailable" : "shop_order_item_gathered",
          fulfillmentId: id,
        });
      }
      toast.success(args.toast);
      invalidateOrders(queryClient);
    },
    onError: (err) => {
      toast.error(fulfillmentMutationError(err));
      invalidateOrders(queryClient);
    },
  });
}

/** Replace the order's tag set. */
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

/** Add an internal note. */
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

/** "Handed over to courier". */
export function useCourierHandover(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => courierHandover(id),
    onSuccess: (detail) => {
      toast.success("Handed over to courier", { description: detail.orderNumber });
      invalidateOrders(queryClient);
    },
    onError: (err) => {
      toast.error(courierHandoverError(err));
      invalidateOrders(queryClient);
    },
  });
}

// Bags

/** Set the bag counts per zone. A refusal (a cold zone with no bag) is shown inline by the caller. */
export function useDeclareParcels(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (counts: { ambient: number; chilled: number; frozen: number }) => declareParcels(id, counts),
    onSuccess: (d) => {
      toast.success(`${d.parcels.length} ${d.parcels.length === 1 ? "bag" : "bags"} ready to label`);
      track({ name: "parcels_declared", fulfillmentId: id, count: d.parcels.length });
      invalidateOrders(queryClient);
    },
    onError: () => invalidateOrders(queryClient),
  });
}

/** Remove one bag. */
export function useVoidParcel(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (parcelId: string) => voidParcel(id, parcelId),
    onSuccess: () => {
      toast.success("Bag removed");
      invalidateOrders(queryClient);
    },
    onError: () => invalidateOrders(queryClient),
  });
}

/** Pack-scan reads for this order. */
export function usePackScan(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reads: Parameters<typeof packScanParcels>[1]) => packScanParcels(id, reads),
    onSuccess: () => {
      track({ name: "pack_scanned", fulfillmentId: id });
      invalidateOrders(queryClient);
    },
    onError: () => invalidateOrders(queryClient),
  });
}
