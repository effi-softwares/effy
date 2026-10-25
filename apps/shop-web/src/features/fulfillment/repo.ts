import type {
  LabelReadDTO,
  ShopRefundRequest,
  FulfillmentDetailDTO,
  ShopOrderActivityDTO,
  ShopOrderDetailDTO,
  ShopOrderListDTO,
  ShopOrderListQuery,
  ShopOrderPicksRequest,
  TransitionRequest,
} from "@effy/shared-types"

import { api } from "@/lib/api"

import type { FulfillmentDetail } from "./model"

export async function transitionFulfillment(id: string, body: TransitionRequest): Promise<FulfillmentDetail> {
  return api.post<FulfillmentDetailDTO>(`/shop/v1/fulfillments/${id}/status`, body)
}

export async function issueShopRefund(
  orderId: string,
  body: ShopRefundRequest,
): Promise<{ refundId: string; status: string; amount: string }> {
  return api.post(`/shop/v1/orders/${orderId}/refunds`, body)
}

export async function listOrders(q: ShopOrderListQuery): Promise<ShopOrderListDTO> {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== "") params.set(k, String(v))
  }
  const qs = params.toString()
  return api.get<ShopOrderListDTO>(`/shop/v1/orders${qs ? `?${qs}` : ""}`)
}

export async function getOrder(id: string): Promise<ShopOrderDetailDTO> {
  return api.get<ShopOrderDetailDTO>(`/shop/v1/orders/${id}`)
}

export async function getOrderActivity(id: string): Promise<ShopOrderActivityDTO> {
  return api.get<ShopOrderActivityDTO>(`/shop/v1/orders/${id}/activity`)
}

export async function setOrderTags(id: string, tags: string[]): Promise<ShopOrderDetailDTO> {
  return api.put<ShopOrderDetailDTO>(`/shop/v1/orders/${id}/tags`, { tags })
}

export async function addOrderNote(id: string, body: string): Promise<ShopOrderDetailDTO> {
  return api.post<ShopOrderDetailDTO>(`/shop/v1/orders/${id}/notes`, { body })
}

export async function courierHandover(id: string): Promise<FulfillmentDetail> {
  return api.post<FulfillmentDetail>(`/shop/v1/fulfillments/${id}/courier-handover`, {})
}

export async function setOrderPicks(id: string, body: ShopOrderPicksRequest): Promise<ShopOrderDetailDTO> {
  return api.post<ShopOrderDetailDTO>(`/shop/v1/orders/${id}/picks`, body)
}

export async function declareParcels(
  id: string,
  counts: { ambient: number; chilled: number; frozen: number },
): Promise<ShopOrderDetailDTO> {
  return api.put<ShopOrderDetailDTO>(`/shop/v1/fulfillments/${id}/parcels`, {
    changeId: crypto.randomUUID(),
    ...counts,
  })
}

export async function voidParcel(id: string, parcelId: string): Promise<ShopOrderDetailDTO> {
  return api.post<ShopOrderDetailDTO>(`/shop/v1/fulfillments/${id}/parcels/${parcelId}/void`, {
    changeId: crypto.randomUUID(),
  })
}

export async function recordParcelPrints(body: {
  changeId: string
  parcelIds: string[]
  layout: "a6" | "a4x4" | "roll62"
  path: "browser" | "zpl"
}): Promise<{ recorded: number }> {
  return api.post<{ recorded: number }>(`/shop/v1/fulfillments/parcels/prints`, body)
}

export async function packScanParcels(id: string, reads: LabelReadDTO[]): Promise<ShopOrderDetailDTO> {
  return api.post<ShopOrderDetailDTO>(`/shop/v1/fulfillments/${id}/parcels/pack-scans`, {
    changeId: crypto.randomUUID(),
    reads,
  })
}
