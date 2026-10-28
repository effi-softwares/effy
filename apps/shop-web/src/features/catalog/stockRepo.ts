import type {
  AdjustStockRequest,
  ListPage,
  ProductStockDetailDTO,
  SetShopStockSettingsRequest,
  SetStockRequest,
  SetThresholdRequest,
  SetTrackingRequest,
  ShopStockSettingsDTO,
  StockMovementDTO,
} from "@effy/shared-types"

import { api } from "@/lib/api"

const base = (variantId: string) => `/inventory/v1/variants/${variantId}/stock`

export function getVariantStock(variantId: string): Promise<ProductStockDetailDTO> {
  return api.get<ProductStockDetailDTO>(base(variantId))
}

/** One page of a size's stock movements, newest first, in the view the address names (103). */
export function fetchMovementPage(variantId: string, qs: URLSearchParams, signal: AbortSignal): Promise<ListPage<StockMovementDTO>> {
  const q = new URLSearchParams(qs)
  q.set("movements", "page")
  return api.get<ListPage<StockMovementDTO>>(`${base(variantId)}?${q}`, { signal })
}

export function setStockCount(variantId: string, body: SetStockRequest): Promise<ProductStockDetailDTO> {
  return api.put<ProductStockDetailDTO>(base(variantId), body)
}

export function adjustStock(variantId: string, body: AdjustStockRequest): Promise<ProductStockDetailDTO> {
  return api.post<ProductStockDetailDTO>(`${base(variantId)}/adjustments`, body)
}

export function setStockTracking(variantId: string, body: SetTrackingRequest): Promise<ProductStockDetailDTO> {
  return api.put<ProductStockDetailDTO>(`${base(variantId)}/tracking`, body)
}

export function setStockThreshold(variantId: string, body: SetThresholdRequest): Promise<ProductStockDetailDTO> {
  return api.put<ProductStockDetailDTO>(`${base(variantId)}/threshold`, body)
}

export function getStockSettings(): Promise<ShopStockSettingsDTO> {
  return api.get<ShopStockSettingsDTO>("/inventory/v1/settings")
}

export function setStockSettings(body: SetShopStockSettingsRequest): Promise<ShopStockSettingsDTO> {
  return api.put<ShopStockSettingsDTO>("/inventory/v1/settings", body)
}
