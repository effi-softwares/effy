import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type {
  AdjustStockRequest,
  SetShopStockSettingsRequest,
  SetStockRequest,
  SetThresholdRequest,
  SetTrackingRequest,
} from "@effy/shared-types"

import {
  adjustStock,
  getVariantStock,
  getStockSettings,
  setStockCount,
  setStockSettings,
  setStockThreshold,
  setStockTracking,
} from "./stockRepo"

export const STOCK_ROOT = ["shop", "stock"] as const

export const variantStockQuery = (variantId: string) =>
  queryOptions({
    queryKey: [...STOCK_ROOT, "variant", variantId] as const,
    queryFn: () => getVariantStock(variantId),
    staleTime: 15_000,
  })

export const stockSettingsQuery = queryOptions({
  queryKey: [...STOCK_ROOT, "settings"] as const,
  queryFn: getStockSettings,
  staleTime: 5 * 60_000,
})

function useStockMutation<TBody>(variantId: string, fn: (variantId: string, body: TBody) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TBody) => fn(variantId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...STOCK_ROOT, "variant", variantId] })
      // The product page's sizes table shows each size's count too.
      void qc.invalidateQueries({ queryKey: ["shop", "catalog", "product"] })
      void qc.invalidateQueries({ queryKey: [...STOCK_ROOT, "low"] })
    },
  })
}

export const useSetStockCount = (variantId: string) => useStockMutation<SetStockRequest>(variantId, setStockCount)

export const useAdjustStock = (variantId: string) => useStockMutation<AdjustStockRequest>(variantId, adjustStock)

export const useSetStockTracking = (variantId: string) =>
  useStockMutation<SetTrackingRequest>(variantId, setStockTracking)

export const useSetStockThreshold = (variantId: string) =>
  useStockMutation<SetThresholdRequest>(variantId, setStockThreshold)

export function useSetStockSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SetShopStockSettingsRequest) => setStockSettings(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: STOCK_ROOT })
    },
  })
}

export function useRefreshStock() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: STOCK_ROOT })
    void qc.invalidateQueries({ queryKey: ["shop", "catalog", "product"] })
  }
}
