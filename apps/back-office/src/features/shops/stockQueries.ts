import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type { SetShopStockSettingsRequest } from "@effy/shared-types"

import { getShopLowStockCounts, setShopStockSettings } from "./stockRepo"

export const STOCK_ROOT = ["admin", "shop-stock"] as const

/** Out and low totals for the shop's page (its tab count and summary line). */
export const shopLowStockCountsQuery = (shopId: string) =>
  queryOptions({
    queryKey: [...STOCK_ROOT, "counts", shopId] as const,
    queryFn: () => getShopLowStockCounts(shopId),
    staleTime: 15_000,
  })

export function useSetShopStockSettings(shopId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SetShopStockSettingsRequest) => setShopStockSettings(shopId, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: STOCK_ROOT }),
  })
}
