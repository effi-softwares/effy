import type {
  BackOfficeProductDTO,
  BackOfficeProductListDTO,
  BulkProductsRequest,
  BulkProductsResultDTO,
  CreateProductRequest,
  HoldProductRequest,
  MarginDTO,
  ProductImportDTO,
  ProductImportListDTO,
  ProductImportTemplateDTO,
  StartProductImportRequest,
  SetStockRequest,
  StaffVariantStateRequest,
  ReleaseProductRequest,
  ReleaseProductResultDTO,
} from "@effy/shared-types"

import { api } from "@/lib/api"

/** One page of every shop's products for the address's view (103). */
export function fetchProductPage(qs: URLSearchParams, signal: AbortSignal): Promise<BackOfficeProductListDTO> {
  return api.get<BackOfficeProductListDTO>(`/catalog/v1/products?${qs}`, { signal })
}

export async function getProduct(productId: string): Promise<BackOfficeProductDTO> {
  return api.get<BackOfficeProductDTO>(`/catalog/v1/products/${productId}`)
}

export async function holdProduct(productId: string, body: HoldProductRequest): Promise<BackOfficeProductDTO> {
  return api.post<BackOfficeProductDTO>(`/catalog/v1/products/${productId}/hold`, body)
}

export async function releaseProduct(productId: string, body: ReleaseProductRequest): Promise<ReleaseProductResultDTO> {
  return api.post<ReleaseProductResultDTO>(`/catalog/v1/products/${productId}/release`, body)
}

export async function bulkProducts(body: BulkProductsRequest): Promise<BulkProductsResultDTO> {
  return api.post<BulkProductsResultDTO>(`/catalog/v1/products/bulk`, body)
}

export async function setVariantState(
  productId: string,
  variantId: string,
  body: StaffVariantStateRequest,
): Promise<BackOfficeProductDTO> {
  return api.post<BackOfficeProductDTO>(`/catalog/v1/products/${productId}/variants/${variantId}/state`, body)
}

/** A size's count, set on the shop's behalf through inventory's staff route (054). */
export async function setStockCount(shopId: string, variantId: string, body: SetStockRequest): Promise<unknown> {
  return api.put(`/inventory/v1/admin/shops/${shopId}/variants/${variantId}/stock`, body)
}

/** Effy's own form (102): a product for a shop, Effy's to finish. */
export type EffyProductBody = CreateProductRequest & {
  media?: { storageKey: string; isPrimary: boolean; displayOrder: number }[]
}

export async function createEffyProduct(
  body: EffyProductBody & { shopId: string; margin: MarginDTO },
): Promise<BackOfficeProductDTO> {
  return api.post<BackOfficeProductDTO>(`/catalog/v1/products`, body)
}

export async function updateEffyProduct(
  productId: string,
  body: EffyProductBody & { version: string },
): Promise<BackOfficeProductDTO> {
  return api.patch<BackOfficeProductDTO>(`/catalog/v1/products/${productId}`, body)
}

/** A picture for a product Effy is finishing: presign, then PUT straight to storage. Returns its key. */
export async function uploadEffyPicture(productId: string, file: File): Promise<string> {
  const target = await api.post<{ uploadUrl: string; storageKey: string }>(`/catalog/v1/products/${productId}/media`, {
    contentType: file.type,
    fileSize: file.size,
  })
  const res = await fetch(target.uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type } })
  if (!res.ok) throw new Error(`upload failed (${res.status})`)
  return target.storageKey
}

// ── Imports (102) ──

export async function startImport(body: StartProductImportRequest): Promise<ProductImportDTO> {
  return api.post<ProductImportDTO>(`/catalog/v1/imports`, body)
}

/** One page of imports for the address's view (103). */
export function fetchImportPage(qs: URLSearchParams, signal: AbortSignal): Promise<ProductImportListDTO> {
  return api.get<ProductImportListDTO>(`/catalog/v1/imports?${qs}`, { signal })
}

export async function getImport(importId: string): Promise<ProductImportDTO> {
  return api.get<ProductImportDTO>(`/catalog/v1/imports/${importId}`)
}

export async function createImport(importId: string, version: string): Promise<ProductImportDTO> {
  return api.post<ProductImportDTO>(`/catalog/v1/imports/${importId}/create`, { version })
}

export async function getImportTemplate(categoryIds: readonly string[]): Promise<ProductImportTemplateDTO> {
  const qs = categoryIds.length > 0 ? `?categoryIds=${categoryIds.map(encodeURIComponent).join(",")}` : ""
  return api.get<ProductImportTemplateDTO>(`/catalog/v1/imports/template${qs}`)
}
