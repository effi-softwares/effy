import type {
  StaffNotificationPreferencesDTO,
  CustomerDetailDTO,
  CustomerListDTO,
  CustomerListItemDTO,
  PointsChangeResultDTO,
  PointsCreditRequest,
  PointsDebitRequest,
  PointsSettingsDTO,
} from "@effy/shared-types"

import { api } from "@/lib/api"

/** A quick search (the command palette): the first page of matches. */
export async function searchCustomers(q: string): Promise<CustomerListItemDTO[]> {
  return (await api.get<CustomerListDTO>(`/orders/v1/customers?q=${encodeURIComponent(q)}`)).items
}

/** One page of Customers for the address's view (103). */
export function fetchCustomerPage(qs: URLSearchParams, signal: AbortSignal): Promise<CustomerListDTO> {
  return api.get<CustomerListDTO>(`/orders/v1/customers?${qs}`, { signal })
}

export function getCustomer(id: string): Promise<CustomerDetailDTO> {
  return api.get<CustomerDetailDTO>(`/orders/v1/customers/${id}`)
}

export function creditPoints(id: string, body: PointsCreditRequest): Promise<PointsChangeResultDTO> {
  return api.post(`/orders/v1/customers/${id}/points/credit`, body)
}

export function debitPoints(id: string, body: PointsDebitRequest): Promise<PointsChangeResultDTO> {
  return api.post(`/orders/v1/customers/${id}/points/debit`, body)
}

export function getPointsSettings(): Promise<PointsSettingsDTO> {
  return api.get<PointsSettingsDTO>(`/orders/v1/points/settings`)
}

export function updatePointsSettings(patch: Partial<PointsSettingsDTO>): Promise<PointsSettingsDTO> {
  return api.put<PointsSettingsDTO>(`/orders/v1/points/settings`, patch)
}

/** 111 - a customer's notification choices and marketing consent, read only (staff cannot change them). */
export function getCustomerNotificationPreferences(id: string): Promise<StaffNotificationPreferencesDTO> {
  return api.get<StaffNotificationPreferencesDTO>(`/orders/v1/customers/${id}/notification-preferences`)
}
