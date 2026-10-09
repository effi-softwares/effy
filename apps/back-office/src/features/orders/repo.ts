import type {
  ConsignmentEventInput,
  ConsignmentInput,
  ConsignmentLabelUploadDTO,
  CourierCollectionInput,
  CourierView,
  AdminOrderDetailDTO,
  AdminOrderListResponse,
  HandoverDueFilter,
  HandoverListResponse,
  HandoverRowDTO,
  RecordArrivalRequest,
  RecordHandoffRequest,
} from "@effy/shared-types";

import { api } from "@/lib/api";

import type { OrderListParams } from "./model";

// The data layer for the back-office order console (053). Screens never touch the api client
// directly (Principle VI). Every endpoint lives on the orders cold-path service behind the shared
// gateway — see specs/053-order-lifecycle-completion/contracts/back-office-orders.contract.md.

function encodeListQuery({ q, status, awaiting, needsDriver, deliveryType, cursor }: OrderListParams): string {
  const params = new URLSearchParams();
  if (needsDriver) params.set("needsDriver", "true");
  if (q && q.trim()) params.set("q", q.trim());
  if (status) params.set("status", status);
  if (awaiting) params.set("awaiting", awaiting);
  if (deliveryType) params.set("deliveryType", deliveryType);
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

/** Standard packages to hand to the carrier, by the day each must leave the hub (069 US7). */
export async function listHandovers(due: HandoverDueFilter): Promise<HandoverRowDTO[]> {
  return (await api.get<HandoverListResponse>(`/orders/v1/handovers?due=${due}`)).items;
}

// ── 080 — courier consignments ────────────────────────────────────────────────────────────────────

export function saveConsignment(fulfillmentId: string, body: ConsignmentInput): Promise<{ consignmentId: string; created: boolean }> {
  return api.put(`/orders/v1/fulfillments/${fulfillmentId}/consignment`, body);
}

export function recordConsignmentStep(fulfillmentId: string, body: ConsignmentEventInput): Promise<{ orderFinished: boolean }> {
  return api.post(`/orders/v1/fulfillments/${fulfillmentId}/consignment/events`, body);
}

/**
 * Upload a courier label: the service presigns a PUT under this package's own prefix, the file goes
 * straight to storage, and the key it lands at is returned for the booking to name.
 */
export async function uploadConsignmentLabel(fulfillmentId: string, file: File): Promise<string> {
  const target = await api.post<ConsignmentLabelUploadDTO>(`/orders/v1/fulfillments/${fulfillmentId}/consignment/label`, {
    contentType: file.type, fileSize: file.size,
  });
  const res = await fetch(target.uploadUrl, { method: "PUT", body: file, headers: { "content-type": target.contentType } });
  if (!res.ok) throw new Error("the label could not be uploaded");
  return target.labelKey;
}

export function changeCourierCollection(orderId: string, body: CourierCollectionInput): Promise<{ changed: boolean }> {
  return api.put(`/orders/v1/orders/${orderId}/courier-collection`, body);
}

/** The Courier tab: one view of the parcels a courier takes that are not finished (080). */
export async function listCourierParcels(view: CourierView): Promise<HandoverRowDTO[]> {
  return (await api.get<HandoverListResponse>(`/orders/v1/handovers?view=${view}`)).items;
}
