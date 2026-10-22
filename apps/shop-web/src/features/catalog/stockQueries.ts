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
  getVariantStock,
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

export const variantStockQuery = (variantId: string) =>
  queryOptions({
    queryKey: [...STOCK_ROOT, "variant", variantId] as const,
    queryFn: () => getVariantStock(variantId),
    // ⚠ Short. Stock is the one thing on this screen that another operator — or a paid order — can
    // change underneath the person looking at it. A stale count here is what a wrong restock
    // decision is made from.
    staleTime: 15_000,
  });

/** The low-stock list (054 US5) — the dashboard's stock half. Same short staleness as a product's own count — it is derived from them. */
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
  variantId: string,
  fn: (variantId: string, body: TBody) => Promise<unknown>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => fn(variantId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...STOCK_ROOT, "variant", variantId] });
      // 098 — the product page's sizes table shows each size's count too.
      void qc.invalidateQueries({ queryKey: ["shop", "catalog", "product"] });
      // The low-stock list is derived from the same counts, so it is stale the moment one moves.
      void qc.invalidateQueries({ queryKey: [...STOCK_ROOT, "low"] });
    },
  });
}

export const useSetStockCount = (variantId: string) =>
  useStockMutation<SetStockRequest>(variantId, setStockCount);

export const useAdjustStock = (variantId: string) =>
  useStockMutation<AdjustStockRequest>(variantId, adjustStock);

export const useSetStockTracking = (variantId: string) =>
  useStockMutation<SetTrackingRequest>(variantId, setStockTracking);

export const useSetStockThreshold = (variantId: string) =>
  useStockMutation<SetThresholdRequest>(variantId, setStockThreshold);

export function useSetStockSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetShopStockSettingsRequest) => setStockSettings(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: STOCK_ROOT });
    },
  });
}

/**
 * 098 — the stock table saves several sizes in one action. It calls the same routes as the per-size
 * dialogs, then refreshes everything those dialogs would (every size's stock, the product, the low list).
 */
export function useRefreshStock() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: STOCK_ROOT });
    void qc.invalidateQueries({ queryKey: ["shop", "catalog", "product"] });
  };
}
