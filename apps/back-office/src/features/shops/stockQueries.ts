import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type { SetShopStockSettingsRequest, SetStockRequest } from "@effy/shared-types";

import {
  getShopLowStock,
  getShopVariantStock,
  setShopVariantStock,
  setShopStockSettings,
} from "./stockRepo";

// Server state lives ONLY in the TanStack Query cache (Principle VI).

const STOCK_ROOT = ["admin", "shop-stock"] as const;

export const shopLowStockQuery = (shopId: string) =>
  queryOptions({
    queryKey: [...STOCK_ROOT, "low", shopId] as const,
    queryFn: () => getShopLowStock(shopId),
    // ⚠ Short. This is the list a support agent reads WHILE a shop is on the phone describing it;
    // a stale one sends them to correct a number that has already moved.
    staleTime: 15_000,
  });

export const shopVariantStockQuery = (shopId: string, variantId: string) =>
  queryOptions({
    queryKey: [...STOCK_ROOT, "variant", shopId, variantId] as const,
    queryFn: () => getShopVariantStock(shopId, variantId),
    staleTime: 15_000,
  });

export function useSetShopVariantStock(shopId: string, variantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetStockRequest) => setShopVariantStock(shopId, variantId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...STOCK_ROOT, "variant", shopId, variantId] });
      void qc.invalidateQueries({ queryKey: [...STOCK_ROOT, "low", shopId] });
    },
  });
}

export function useSetShopStockSettings(shopId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetShopStockSettingsRequest) => setShopStockSettings(shopId, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: STOCK_ROOT }),
  });
}
