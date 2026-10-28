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
  AdminPromotionImageDTO,
  AdminPromotionImageUploadResponse,
  AdminUpdatePromotionImageRequest,
  OrderPolicyDTO,
} from "@effy/shared-types"

import { api } from "@/lib/api"

import type { AuditEntry, OrderPolicy, PromotionListParams, UpdateOrderPolicyRequest } from "./model"

function encode(p: PromotionListParams): string {
  const params = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) })
  for (const k of ["q", "state", "kind", "trigger", "groupId"] as const) {
    const v = p[k]
    if (v && String(v).trim()) params.set(k, String(v).trim())
  }
  return params.toString()
}

export const listPromotions = (p: PromotionListParams) =>
  api.get<AdminPromotionListDTO>(`/admin/v1/promotions?${encode(p)}`)
/** One page of promotions for the address's view (103). */
export const fetchPromotionPage = (qs: URLSearchParams, signal: AbortSignal) =>
  api.get<AdminPromotionListDTO>(`/admin/v1/promotions?${qs}`, { signal })
export const getPromotion = (id: string) => api.get<AdminPromotionDTO>(`/admin/v1/promotions/${id}`)
export const createPromotion = (body: AdminPromotionWriteDTO) =>
  api.post<AdminPromotionDTO>("/admin/v1/promotions", body)
export const updatePromotion = (id: string, body: Partial<AdminPromotionWriteDTO>) =>
  api.patch<AdminPromotionDTO>(`/admin/v1/promotions/${id}`, body)
export const actOnPromotion = (id: string, body: AdminPromotionActionRequest) =>
  api.post<AdminPromotionDTO>(`/admin/v1/promotions/${id}/actions`, body)
export const deletePromotion = (id: string) => api.delete<void>(`/admin/v1/promotions/${id}`)
export const getPromotionHistory = (id: string) => api.get<AuditEntry[]>(`/admin/v1/promotions/${id}/audit`)

export const getOrderPolicy = () => api.get<OrderPolicyDTO>("/admin/v1/order-policy")
export const putOrderPolicy = (body: UpdateOrderPolicyRequest): Promise<OrderPolicy> =>
  api.put<OrderPolicyDTO>("/admin/v1/order-policy", body)

export const searchPromotionProducts = (q: string) =>
  api.get<{ id: string; name: string; brand: string | null }[]>(
    `/admin/v1/promotions/products?q=${encodeURIComponent(q)}`,
  )

export const fetchChosenCustomerPage = (id: string, qs: URLSearchParams, signal: AbortSignal) =>
  api.get<AdminPromotionCustomerListDTO>(`/admin/v1/promotions/${id}/customers?${qs}`, { signal })
export const addChosenCustomers = (id: string, body: { emails?: string[]; customerIds?: string[] }) =>
  api.post<AdminAddPromotionCustomersResponse>(`/admin/v1/promotions/${id}/customers`, body)
export const removeChosenCustomer = (id: string, customerId: string) =>
  api.delete<void>(`/admin/v1/promotions/${id}/customers/${customerId}`)
export const generateCodes = (id: string, body: { count: number; prefix?: string | null }) =>
  api.post<AdminGenerateCodesResponse>(`/admin/v1/promotions/${id}/codes`, body)
export const fetchCodePage = (id: string, qs: URLSearchParams, signal: AbortSignal) =>
  api.get<AdminPromotionCodeListDTO>(`/admin/v1/promotions/${id}/codes?${qs}`, { signal })
export const exportCodes = (id: string) => api.get<{ csv: string }>(`/admin/v1/promotions/${id}/codes/export`)
export const getPerformance = (id: string) =>
  api.get<AdminPromotionPerformanceDTO>(`/admin/v1/promotions/${id}/performance`)

export async function addPromotionImage(promotionId: string, file: File, alt: string): Promise<AdminPromotionImageDTO> {
  const target = await api.post<AdminPromotionImageUploadResponse>(
    `/admin/v1/promotions/${promotionId}/images/uploads`,
    {
      contentType: file.type,
      fileSize: file.size,
    },
  )
  const res = await fetch(target.uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type } })
  if (!res.ok) throw new Error("the picture could not be uploaded")
  return api.post<AdminPromotionImageDTO>(`/admin/v1/promotions/${promotionId}/images`, {
    storageKey: target.storageKey,
    alt,
  })
}

export const updatePromotionImage = (promotionId: string, imageId: string, body: AdminUpdatePromotionImageRequest) =>
  api.patch<AdminPromotionImageDTO>(`/admin/v1/promotions/${promotionId}/images/${imageId}`, body)

export const removePromotionImage = (promotionId: string, imageId: string, confirm: boolean) =>
  api.delete<void>(`/admin/v1/promotions/${promotionId}/images/${imageId}${confirm ? "?confirm=true" : ""}`)
