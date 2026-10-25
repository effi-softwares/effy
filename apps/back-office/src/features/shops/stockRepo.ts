import type { LowStockRowDTO, SetShopStockSettingsRequest } from "@effy/shared-types"

import { api } from "@/lib/api"

const base = (shopId: string) => `/inventory/v1/admin/shops/${shopId}`

export function getShopLowStock(shopId: string): Promise<LowStockRowDTO[]> {
  return api.get<LowStockRowDTO[]>(`${base(shopId)}/low-stock`)
}

export function setShopStockSettings(
  shopId: string,
  body: SetShopStockSettingsRequest,
): Promise<{ defaultThreshold: number | null }> {
  return api.put(`${base(shopId)}/settings`, body)
}
