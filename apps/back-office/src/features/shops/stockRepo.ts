import type { ListPage, LowStockRowDTO, SetShopStockSettingsRequest } from "@effy/shared-types"

import { api } from "@/lib/api"

const base = (shopId: string) => `/inventory/v1/admin/shops/${shopId}`

/** One page of the shop's restock list, in the view the address names (103). */
export function fetchShopLowStockPage(shopId: string, qs: URLSearchParams, signal: AbortSignal): Promise<ListPage<LowStockRowDTO>> {
  return api.get<ListPage<LowStockRowDTO>>(`${base(shopId)}/low-stock?${qs}`, { signal })
}

/** How many sizes are out and how many are low: each list's exact total. */
export async function getShopLowStockCounts(shopId: string): Promise<{ out: number; low: number }> {
  const [out, low] = await Promise.all(
    (["out", "low"] as const).map((severity) =>
      api.get<ListPage<LowStockRowDTO>>(`${base(shopId)}/low-stock?severity=${severity}&pageSize=25`),
    ),
  )
  return { out: out!.total, low: low!.total }
}

export function setShopStockSettings(
  shopId: string,
  body: SetShopStockSettingsRequest,
): Promise<{ defaultThreshold: number | null }> {
  return api.put(`${base(shopId)}/settings`, body)
}
