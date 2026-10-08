import type {
  CustomerDetailDTO,
  CustomerSearchResultDTO,
  PointsChangeResultDTO,
  PointsCreditRequest,
  PointsDebitRequest,
  PointsSettingsDTO,
  StaffPointsHistoryPageDTO,
} from "@effy/shared-types";

import { api } from "@/lib/api";

// The data layer for back-office customers and their points (074). Screens never touch the api client
// directly (Principle VI). Every route is on the orders service — contracts/routes.md.

export async function searchCustomers(q: string): Promise<CustomerSearchResultDTO[]> {
  return (await api.get<{ customers: CustomerSearchResultDTO[] }>(`/orders/v1/customers?q=${encodeURIComponent(q)}`)).customers;
}

export function getCustomer(id: string): Promise<CustomerDetailDTO> {
  return api.get<CustomerDetailDTO>(`/orders/v1/customers/${id}`);
}

export function getPointsHistory(id: string, cursor?: string): Promise<StaffPointsHistoryPageDTO> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return api.get(`/orders/v1/customers/${id}/points/history${qs}`);
}

export function creditPoints(id: string, body: PointsCreditRequest): Promise<PointsChangeResultDTO> {
  return api.post(`/orders/v1/customers/${id}/points/credit`, body);
}

export function debitPoints(id: string, body: PointsDebitRequest): Promise<PointsChangeResultDTO> {
  return api.post(`/orders/v1/customers/${id}/points/debit`, body);
}

export function getPointsSettings(): Promise<PointsSettingsDTO> {
  return api.get<PointsSettingsDTO>(`/orders/v1/points/settings`);
}

export function updatePointsSettings(patch: Partial<PointsSettingsDTO>): Promise<PointsSettingsDTO> {
  return api.put<PointsSettingsDTO>(`/orders/v1/points/settings`, patch);
}
