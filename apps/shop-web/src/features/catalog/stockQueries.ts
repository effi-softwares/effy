import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  AdjustStockRequest,
  SetShopStockSettingsRequest,
  SetStockRequest,
  SetThresholdRequest,
  SetTrackingRequest,
} from "@effy/shared-types";

import {
  adjustStock,
  getLowStock,
  getProductStock,
  getStockSettings,
  setStockCount,
  setStockSettings,
  setStockThreshold,
  setStockTracking,
} from "./stockRepo";

// Server state lives ONLY in the TanStack Query cache (Principle VI) — no hand-caching in component
// state. Every mutation invalidates the product's stock key rather than patching the cached value,
// because the server returns the authoritative row INCLUDING its movement history, and a
// hand-patched history would be a second account of what happened.

const STOCK_ROOT = ["shop", "stock"] as const;

export const productStockQuery = (productId: string) =>
  queryOptions({
    queryKey: [...STOCK_ROOT, "product", productId] as const,
    queryFn: () => getProductStock(productId),
    // ⚠ Short. Stock is the one thing on this screen that another operator — or a paid order — can
    // change underneath the person looking at it. A stale count here is what a wrong restock
    // decision is made from.
    staleTime: 15_000,
  });

/** The restock list (US5). Same short staleness as a product's own count — it is derived from them. */
export const lowStockQuery = queryOptions({
  queryKey: [...STOCK_ROOT, "low"] as const,
  queryFn: getLowStock,
  staleTime: 15_000,
});

export const stockSettingsQuery = queryOptions({
  queryKey: [...STOCK_ROOT, "settings"] as const,
  queryFn: getStockSettings,
  staleTime: 5 * 60_000,
});

function useStockMutation<TBody>(
  productId: string,
  fn: (productId: string, body: TBody) => Promise<unknown>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => fn(productId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...STOCK_ROOT, "product", productId] });
      // The low-stock list is derived from the same counts, so it is stale the moment one moves.
      void qc.invalidateQueries({ queryKey: [...STOCK_ROOT, "low"] });
    },
  });
}

export const useSetStockCount = (productId: string) =>
  useStockMutation<SetStockRequest>(productId, setStockCount);

export const useAdjustStock = (productId: string) =>
  useStockMutation<AdjustStockRequest>(productId, adjustStock);

export const useSetStockTracking = (productId: string) =>
  useStockMutation<SetTrackingRequest>(productId, setStockTracking);

export const useSetStockThreshold = (productId: string) =>
  useStockMutation<SetThresholdRequest>(productId, setStockThreshold);

export function useSetStockSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetShopStockSettingsRequest) => setStockSettings(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: STOCK_ROOT });
    },
  });
}
