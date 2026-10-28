import type {
  SetVariantStateRequest,
  ChangeProductStatusRequest,
  CreateProductRequest,
  CreateShopSectionRequest,
  SetProductSectionsRequest,
  UpdateMediaRequest,
  UpdateProductRequest,
  UpdateShopSectionRequest,
} from "@effy/shared-types"
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import {
  changeProductStatus,
  createProduct,
  createSection,
  deleteProduct,
  deleteProductMedia,
  deleteSection,
  getCategoryForm,
  getShopTaxonomy,
  getProduct,
  listProducts,
  listSections,
  setProductSections,
  submitProductForReview,
  updateProduct,
  updateProductMedia,
  updateSection,
  uploadProductMedia,
  withdrawProductReview,
  setVariantState,
} from "./repo"
import type { ProductListParams } from "./model"

const CATALOG_ROOT = ["shop", "catalog"] as const
/** The list and one product: a live `products` update (an Effy hold or release, 102) re-reads both. */
export const PRODUCTS_ROOT = ["shop", "catalog", "products"] as const
const PRODUCT_ROOT = ["shop", "catalog", "product"] as const

/** The category tree for the picker: it changes rarely, and a live `taxonomy` update re-reads it (101). */
const TAXONOMY_ROOT = ["shop", "catalog", "taxonomy"] as const

export const taxonomyQuery = queryOptions({
  queryKey: TAXONOMY_ROOT,
  queryFn: getShopTaxonomy,
  staleTime: 30 * 60_000,
})

/** A leaf's form; re-read when the taxonomy changes. */
export const categoryFormQuery = (categoryId: string) =>
  queryOptions({
    queryKey: [...TAXONOMY_ROOT, "form", categoryId] as const,
    queryFn: () => getCategoryForm(categoryId),
    staleTime: 30 * 60_000,
  })

export const productListQuery = (params: ProductListParams) =>
  queryOptions({
    queryKey: [...PRODUCTS_ROOT, params] as const,
    queryFn: () => listProducts(params),
  })

export const productDetailQuery = (id: string) =>
  queryOptions({
    queryKey: [...PRODUCT_ROOT, id] as const,
    queryFn: () => getProduct(id),
  })

export const sectionsQuery = queryOptions({
  queryKey: [...CATALOG_ROOT, "sections"] as const,
  queryFn: listSections,
  staleTime: 5 * 60_000,
})

function invalidateProducts(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: PRODUCTS_ROOT })
}

function invalidateDetail(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  void queryClient.invalidateQueries({ queryKey: [...PRODUCT_ROOT, id] })
}

export function useCreateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateProductRequest) => createProduct(body),
    onSuccess: () => invalidateProducts(queryClient),
  })
}

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateProductRequest) => updateProduct(id, body),
    onSuccess: () => {
      invalidateDetail(queryClient, id)
      invalidateProducts(queryClient)
    },
  })
}

export function useUploadMedia(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { file: File; isPrimary?: boolean; onProgress?: (p: number) => void }) =>
      uploadProductMedia(id, args.file, { isPrimary: args.isPrimary, onProgress: args.onProgress }),
    onSuccess: () => {
      invalidateDetail(queryClient, id)
      invalidateProducts(queryClient)
    },
  })
}

export function useUpdateMedia(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { mediaId: string; body: UpdateMediaRequest }) =>
      updateProductMedia(id, args.mediaId, args.body),
    onSuccess: () => {
      invalidateDetail(queryClient, id)
      invalidateProducts(queryClient)
    },
  })
}

export function useDeleteMedia(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (mediaId: string) => deleteProductMedia(id, mediaId),
    onSuccess: () => {
      invalidateDetail(queryClient, id)
      invalidateProducts(queryClient)
    },
  })
}

export function useChangeStatus(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ChangeProductStatusRequest) => changeProductStatus(id, body),
    onSuccess: () => {
      invalidateDetail(queryClient, id)
      invalidateProducts(queryClient)
    },
  })
}

export function useSetVariantState(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ variantId, state }: { variantId: string; state: SetVariantStateRequest["state"] }) =>
      setVariantState(productId, variantId, { state }),
    onSuccess: () => {
      invalidateDetail(queryClient, productId)
      invalidateProducts(queryClient)
    },
  })
}

export function useSubmitForReview(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => submitProductForReview(id),
    onSuccess: () => {
      invalidateDetail(queryClient, id)
      invalidateProducts(queryClient)
    },
  })
}

export function useWithdrawReview(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => withdrawProductReview(id),
    onSuccess: () => {
      invalidateDetail(queryClient, id)
      invalidateProducts(queryClient)
    },
  })
}

export function useDeleteProduct(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => deleteProduct(id),
    onSuccess: () => invalidateProducts(queryClient),
  })
}

export function useSetProductSections(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: SetProductSectionsRequest) => setProductSections(id, body),
    onSuccess: () => {
      invalidateDetail(queryClient, id)
      invalidateProducts(queryClient)
    },
  })
}

function invalidateSections(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: [...CATALOG_ROOT, "sections"] })
}

export function useCreateSection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateShopSectionRequest) => createSection(body),
    onSuccess: () => invalidateSections(queryClient),
  })
}

export function useUpdateSection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; body: UpdateShopSectionRequest }) => updateSection(args.id, args.body),
    onSuccess: () => invalidateSections(queryClient),
  })
}

export function useDeleteSection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteSection(id),
    onSuccess: () => {
      invalidateSections(queryClient)
      invalidateProducts(queryClient)
    },
  })
}
