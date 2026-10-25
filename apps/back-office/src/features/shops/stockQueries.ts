import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type { SetShopStockSettingsRequest } from "@effy/shared-types"

import { getShopLowStock, setShopStockSettings } from "./stockRepo"

const STOCK_ROOT = ["admin", "shop-stock"] as const

export const shopLowStockQuery = (shopId: string) =>
  queryOptions({
    queryKey: [...STOCK_ROOT, "low", shopId] as const,
    queryFn: () => getShopLowStock(shopId),
    staleTime: 15_000,
  })

export function useSetShopStockSettings(shopId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SetShopStockSettingsRequest) => setShopStockSettings(shopId, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: STOCK_ROOT }),
  })
}
