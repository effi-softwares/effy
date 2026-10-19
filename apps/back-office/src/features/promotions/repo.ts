import type {
  AdminAddPromotionCustomersResponse,
  AdminGenerateCodesResponse,
  AdminPromotionCodeListDTO,
  AdminPromotionCustomerListDTO,
  AdminPromotionPerformanceDTO,
  AdminPromotionActionRequest,
  AdminPromotionDTO,
  AdminPromotionListDTO,
  AdminPromotionWriteDTO,
  OrderPolicyDTO,
} from "@effy/shared-types";

import { api } from "@/lib/api";

import type { AuditEntry, OrderPolicy, PromotionListParams, UpdateOrderPolicyRequest } from "./model";

// The data layer for back-office promotions (094) and the order rules. Screens never touch the api
// client directly (Principle VI). All routes are the admin service's, on the staff gateway.

function encode(p: PromotionListParams): string {
  const params = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
  for (const k of ["q", "state", "kind", "trigger", "groupId"] as const) {
    const v = p[k];
    if (v && String(v).trim()) params.set(k, String(v).trim());
  }
  return params.toString();
}

export const listPromotions = (p: PromotionListParams) => api.get<AdminPromotionListDTO>(`/admin/v1/promotions?${encode(p)}`);
export const getPromotion = (id: string) => api.get<AdminPromotionDTO>(`/admin/v1/promotions/${id}`);
export const createPromotion = (body: AdminPromotionWriteDTO) => api.post<AdminPromotionDTO>("/admin/v1/promotions", body);
export const updatePromotion = (id: string, body: Partial<AdminPromotionWriteDTO>) => api.patch<AdminPromotionDTO>(`/admin/v1/promotions/${id}`, body);
export const actOnPromotion = (id: string, body: AdminPromotionActionRequest) => api.post<AdminPromotionDTO>(`/admin/v1/promotions/${id}/actions`, body);
export const deletePromotion = (id: string) => api.delete<void>(`/admin/v1/promotions/${id}`);
export const getPromotionHistory = (id: string) => api.get<AuditEntry[]>(`/admin/v1/promotions/${id}/audit`);

export const getOrderPolicy = () => api.get<OrderPolicyDTO>("/admin/v1/order-policy");
export const putOrderPolicy = (body: UpdateOrderPolicyRequest): Promise<OrderPolicy> => api.put<OrderPolicyDTO>("/admin/v1/order-policy", body);

/** Products a promotion can target (094 US3), by name, SKU or brand. */
export const searchPromotionProducts = (q: string) =>
  api.get<{ id: string; name: string; brand: string | null }[]>(`/admin/v1/promotions/products?q=${encodeURIComponent(q)}`);

// ── chosen customers, single-use codes, performance (094 US6, US7, US9) ─────────────────────────

export const listChosenCustomers = (id: string, page = 1) => api.get<AdminPromotionCustomerListDTO>(`/admin/v1/promotions/${id}/customers?page=${page}`);
export const addChosenCustomers = (id: string, body: { emails?: string[]; customerIds?: string[] }) =>
  api.post<AdminAddPromotionCustomersResponse>(`/admin/v1/promotions/${id}/customers`, body);
export const removeChosenCustomer = (id: string, customerId: string) => api.delete<void>(`/admin/v1/promotions/${id}/customers/${customerId}`);
export const generateCodes = (id: string, body: { count: number; prefix?: string | null }) => api.post<AdminGenerateCodesResponse>(`/admin/v1/promotions/${id}/codes`, body);
export const listCodes = (id: string, page = 1, state?: string) =>
  api.get<AdminPromotionCodeListDTO>(`/admin/v1/promotions/${id}/codes?page=${page}${state ? `&state=${state}` : ""}`);
export const exportCodes = (id: string) => api.get<{ csv: string }>(`/admin/v1/promotions/${id}/codes/export`);
export const getPerformance = (id: string) => api.get<AdminPromotionPerformanceDTO>(`/admin/v1/promotions/${id}/performance`);
