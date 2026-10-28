import type {
  ConsignmentEventInput,
  ConsignmentInput,
  ConsignmentLabelUploadDTO,
  CourierCollectionInput,
  AdminOrderDetailDTO,
  AdminOrdersTodayDTO,
  AdminOrderViewCountsDTO,
  DeliveryMovePreviewDTO,
  DeliveryMoveRequest,
  DeliveryMoveResponse,
  DeliveryType,
  AdminOrderListResponse,
  CourierParcelListDTO,
  RecordArrivalRequest,
  RecordHandoffRequest,
  AdminLookupDTO,
} from "@effy/shared-types"

import { isDomainError } from "@effy/api-client"

import { api } from "@/lib/api"

import type { OrderListParams } from "./model"

/** For the quick reads outside the list (the command palette's search, the overview's counts). */
function encodeListQuery({ q, status, deliveryType, promise }: OrderListParams): string {
  const params = new URLSearchParams()
  if (q && q.trim()) params.set("q", q.trim())
  if (status) params.set("status", status)
  if (deliveryType) params.set("deliveryType", deliveryType)
  if (promise) params.set("promise", promise)
  return params.toString()
}

export async function getOrderViewCounts(params: OrderListParams): Promise<AdminOrderViewCountsDTO> {
  const { q, deliveryType, promise } = params
  const qs = encodeListQuery({ q, deliveryType, promise })
  return api.get<AdminOrderViewCountsDTO>(`/orders/v1/summary/views${qs ? `?${qs}` : ""}`)
}

export async function listOrders(params: OrderListParams): Promise<AdminOrderListResponse> {
  const qs = encodeListQuery(params)
  return api.get<AdminOrderListResponse>(`/orders/v1/orders${qs ? `?${qs}` : ""}`)
}

/** One page of the Orders list for the address's view (103). */
export function fetchOrderPage(qs: URLSearchParams, signal: AbortSignal): Promise<AdminOrderListResponse> {
  return api.get<AdminOrderListResponse>(`/orders/v1/orders?${qs}`, { signal })
}

/** Every view's count under the list's other filters, in one request. */
export function fetchOrderViews(qs: URLSearchParams, signal: AbortSignal): Promise<{ views: AdminOrderViewCountsDTO }> {
  return api.get<{ views: AdminOrderViewCountsDTO }>(`/orders/v1/orders?${qs}`, { signal })
}

export async function getOrdersToday(): Promise<AdminOrdersTodayDTO> {
  return api.get<AdminOrdersTodayDTO>("/orders/v1/summary/today")
}

export async function lookupLabel(q: string, method: "scan" | "typed"): Promise<AdminLookupDTO | null> {
  try {
    return await api.get<AdminLookupDTO>(`/orders/v1/admin/lookup?${new URLSearchParams({ q, method })}`)
  } catch (err) {
    if (isDomainError(err) && err.status === 404) return null
    throw err
  }
}

export async function getOrder(orderId: string): Promise<AdminOrderDetailDTO> {
  return api.get<AdminOrderDetailDTO>(`/orders/v1/orders/${orderId}`)
}

export async function recordHandoff(fulfillmentId: string, body: RecordHandoffRequest): Promise<unknown> {
  return api.post(`/orders/v1/fulfillments/${fulfillmentId}/handoff`, body)
}

export async function recordArrival(fulfillmentId: string, body: RecordArrivalRequest): Promise<unknown> {
  return api.post(`/orders/v1/fulfillments/${fulfillmentId}/arrival`, body)
}

export function saveConsignment(
  fulfillmentId: string,
  body: ConsignmentInput,
): Promise<{ consignmentId: string; created: boolean }> {
  return api.put(`/orders/v1/fulfillments/${fulfillmentId}/consignment`, body)
}

export function recordConsignmentStep(
  fulfillmentId: string,
  body: ConsignmentEventInput,
): Promise<{ orderFinished: boolean }> {
  return api.post(`/orders/v1/fulfillments/${fulfillmentId}/consignment/events`, body)
}

export async function uploadConsignmentLabel(fulfillmentId: string, file: File): Promise<string> {
  const target = await api.post<ConsignmentLabelUploadDTO>(
    `/orders/v1/fulfillments/${fulfillmentId}/consignment/label`,
    {
      contentType: file.type,
      fileSize: file.size,
    },
  )
  const res = await fetch(target.uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "content-type": target.contentType },
  })
  if (!res.ok) throw new Error("the label could not be uploaded")
  return target.labelKey
}

export function changeCourierCollection(orderId: string, body: CourierCollectionInput): Promise<{ changed: boolean }> {
  return api.put(`/orders/v1/orders/${orderId}/courier-collection`, body)
}

/** One page of courier parcels for the address's view (103), with every stage's count. */
export function fetchCourierPage(qs: URLSearchParams, signal: AbortSignal): Promise<CourierParcelListDTO> {
  return api.get<CourierParcelListDTO>(`/orders/v1/handovers?${qs}`, { signal })
}

export function previewDeliveryMove(orderId: string, to: DeliveryType): Promise<DeliveryMovePreviewDTO> {
  return api.get(`/orders/v1/orders/${orderId}/delivery-move?to=${to}`)
}

export function moveDelivery(orderId: string, body: DeliveryMoveRequest): Promise<DeliveryMoveResponse> {
  return api.post(`/orders/v1/orders/${orderId}/delivery-move`, body)
}

export function changeDeliveryWindow(
  orderId: string,
  body: { window: { slotId: string; date: string }; reason: string; expectedUpdatedAt: string },
): Promise<{ orderId: string; promise: "window" | "day" }> {
  return api.post(`/orders/v1/orders/${orderId}/delivery-window`, body)
}
