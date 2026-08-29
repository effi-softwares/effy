import type {
  AdminOrderDetailDTO,
  AdminOrderListResponse,
  RecordArrivalRequest,
  RecordHandoffRequest,
} from "@effy/shared-types";

import { api } from "@/lib/api";

import type { OrderListParams } from "./model";

// The data layer for the back-office order console (053). Screens never touch the api client
// directly (Principle VI). Every endpoint lives on the orders cold-path service behind the shared
// gateway — see specs/053-order-lifecycle-completion/contracts/back-office-orders.contract.md.

function encodeListQuery({ q, status, awaiting, cursor }: OrderListParams): string {
  const params = new URLSearchParams();
  if (q && q.trim()) params.set("q", q.trim());
  if (status) params.set("status", status);
  if (awaiting) params.set("awaiting", awaiting);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export async function listOrders(params: OrderListParams): Promise<AdminOrderListResponse> {
  const qs = encodeListQuery(params);
  return api.get<AdminOrderListResponse>(`/orders/v1/orders${qs ? `?${qs}` : ""}`);
}

export async function getOrder(orderId: string): Promise<AdminOrderDetailDTO> {
  return api.get<AdminOrderDetailDTO>(`/orders/v1/orders/${orderId}`);
}

/**
 * ⚠ `changeId` is minted PER ACTION, not per attempt (027's rule). A retry of the same press reuses
 * it, so a request that arrived without its response reaching us cannot apply twice.
 */
export async function recordHandoff(
  fulfillmentId: string,
  body: RecordHandoffRequest,
): Promise<unknown> {
  return api.post(`/orders/v1/fulfillments/${fulfillmentId}/handoff`, body);
}

export async function recordArrival(
  fulfillmentId: string,
  body: RecordArrivalRequest,
): Promise<unknown> {
  return api.post(`/orders/v1/fulfillments/${fulfillmentId}/arrival`, body);
}
