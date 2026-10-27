import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type {
  BulkProductsRequest,
  HoldProductRequest,
  ReleaseProductRequest,
  SetStockRequest,
  StaffVariantStateRequest,
} from "@effy/shared-types"

import {
  getImport,
  listImports,
  bulkProducts,
  getProduct,
  holdProduct,
  listProducts,
  releaseProduct,
  setStockCount,
  setVariantState,
} from "./repo"
import type { ProductSearch } from "./model"

/** A live `products` update re-reads everything under this root (`features/live/routes.ts`). */
export const productKeys = {
  all: ["products"] as const,
  list: (search: ProductSearch) => ["products", "list", search] as const,
  detail: (productId: string) => ["products", "detail", productId] as const,
  imports: (shopId: string | null) => ["products", "imports", shopId] as const,
  import: (importId: string) => ["products", "import", importId] as const,
}

export const productListQuery = (search: ProductSearch) =>
  infiniteQueryOptions({
    queryKey: productKeys.list(search),
    queryFn: ({ pageParam }) => listProducts(search, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })

export const productQuery = (productId: string) =>
  queryOptions({ queryKey: productKeys.detail(productId), queryFn: () => getProduct(productId) })

/** Any write: the list, its counts and the page re-read (the live update does the same for others). */
function useProductMutation<TVars, TOut>(fn: (vars: TVars) => Promise<TOut>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  })
}

export const useHoldProduct = (productId: string) =>
  useProductMutation((body: HoldProductRequest) => holdProduct(productId, body))

export const useReleaseProduct = (productId: string) =>
  useProductMutation((body: ReleaseProductRequest) => releaseProduct(productId, body))

export const useBulkProducts = () => useProductMutation((body: BulkProductsRequest) => bulkProducts(body))

export const useSetVariantState = (productId: string) =>
  useProductMutation((v: { variantId: string; body: StaffVariantStateRequest }) =>
    setVariantState(productId, v.variantId, v.body),
  )

export const useSetStockCount = (shopId: string) =>
  useProductMutation((v: { variantId: string; body: SetStockRequest }) => setStockCount(shopId, v.variantId, v.body))

export const importListQuery = (shopId: string | null) =>
  infiniteQueryOptions({
    queryKey: productKeys.imports(shopId),
    queryFn: ({ pageParam }) => listImports(shopId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })

/** An import being checked or created is re-read when the worker announces `products` — never on a timer. */
export const importQuery = (importId: string) =>
  queryOptions({ queryKey: productKeys.import(importId), queryFn: () => getImport(importId) })
