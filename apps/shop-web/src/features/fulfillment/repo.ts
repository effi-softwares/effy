import type {
  ShopRefundRequest,
  FulfillmentDetailDTO,
  FulfillmentQueueDTO,
  ItemProgressRequest,
  TransitionRequest,
} from "@effy/shared-types";

import { api, coreApi } from "@/lib/api";

import type { FulfillmentDetail, FulfillmentQueue, FulfillmentQueueState } from "./model";

// The data layer for shop-web fulfillment (020). The ONLY file in this slice that imports the api
// client — screens read through `queries.ts` and never touch transport (Principle VI).
//
// NOTHING here sends a shop identifier. The caller's shop is resolved server-side from their
// `shop_staff` record, so cross-shop access is un-representable on the wire (FR-019, SC-007). A
// portion that is missing OR another shop's returns the SAME uniform 403 — there is no 404 to
// distinguish them, by design, so no client-side ownership check exists or is needed.

/** The queue (US1/US4). `active` = pending|received|picking; `completed` = ready_for_pickup|collected. */
export async function listFulfillments(state: FulfillmentQueueState): Promise<FulfillmentQueue> {
  return api.get<FulfillmentQueueDTO>(`/shop/v1/fulfillments?state=${state}`);
}

/**
 * The pick screen (US2).
 *
 * ⚠ This read has a SIDE EFFECT by contract: a `pending` portion transitions to `received` —
 * opening it IS the acknowledgement (FR-011a). That is why the queue is invalidated after a detail
 * read lands rather than being left to the poll.
 */
export async function getFulfillment(id: string): Promise<FulfillmentDetail> {
  return api.get<FulfillmentDetailDTO>(`/shop/v1/fulfillments/${id}`);
}

/**
 * Advance or reverse the portion (US3). Only `picking` and `ready_for_pickup` are requestable.
 * An illegal transition from the current state is a 409 — the portion moved under us.
 */
export async function transitionFulfillment(
  id: string,
  body: TransitionRequest,
): Promise<FulfillmentDetail> {
  return api.post<FulfillmentDetailDTO>(`/shop/v1/fulfillments/${id}/status`, body);
}

/**
 * Record picking progress / shortfall on ONE line (US2, FR-010a…FR-010f).
 *
 * Quantities are ABSOLUTE, never deltas — idempotent under retry, which matters on a flaky shop
 * tablet. Lowering `unavailableQuantity` back to 0 is how a flagged item is un-flagged when it turns
 * up (FR-010d). Returns the whole updated portion, so the caller invalidates rather than patches.
 */
export async function updateItemProgress(
  id: string,
  orderItemId: string,
  body: ItemProgressRequest,
): Promise<FulfillmentDetail> {
  return api.patch<FulfillmentDetailDTO>(
    `/shop/v1/fulfillments/${id}/items/${orderItemId}`,
    body,
  );
}

/**
 * Refund part of this shop's portion of an order (057 US5).
 *
 * ⚠ THE ONLY CALL ON THIS SURFACE THAT GOES TO THE HOT PATH. It settles through 055's refund state
 * machine, which lives in `core-api` because the payment secret does and nowhere else. The route is
 * mounted behind core-api's own shop-pool verifier — one route, on that whole service.
 *
 * ⚠ IT SENDS LINES AND QUANTITIES, NEVER AN AMOUNT. The server prices the refund from the receipt and
 * REFUSES a client-supplied amount, so the two can never disagree about what was covered.
 */
export async function issueShopRefund(
  orderId: string,
  body: ShopRefundRequest,
): Promise<{ refundId: string; status: string; amount: string }> {
  return coreApi.post(`/v1/shop/orders/${orderId}/refunds`, body);
}
