import { api } from "@/lib/api"

import type { ListViews } from "@effy/shared-types"

import type { DeliverabilityView, DeliveryDetail, DeliveryList, DeliveryListParams } from "./model"

/** A quick read: the addresses needing attention (the rail's and the overview's count is its total). */
export async function listDeliverability(_: DeliveryListParams = {}): Promise<DeliveryList> {
  return api.get<DeliveryList>("/admin/v1/deliverability")
}

/** One page for the address's view (103). */
export function fetchDeliverabilityPage(qs: URLSearchParams, signal: AbortSignal): Promise<DeliveryList> {
  return api.get<DeliveryList>(`/admin/v1/deliverability?${qs}`, { signal })
}

export function fetchDeliverabilityViews(qs: URLSearchParams, signal: AbortSignal): Promise<ListViews<DeliverabilityView>> {
  return api.get<ListViews<DeliverabilityView>>(`/admin/v1/deliverability?${qs}`, { signal })
}

export async function getDeliverability(address: string): Promise<DeliveryDetail> {
  return api.get<DeliveryDetail>(`/admin/v1/deliverability/${encodeURIComponent(address)}`)
}

export async function repairDeliverability(address: string, note: string): Promise<DeliveryDetail> {
  return api.post<DeliveryDetail>(`/admin/v1/deliverability/${encodeURIComponent(address)}/repair`, { note })
}
