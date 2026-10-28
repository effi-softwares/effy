import type {
  SetVariantStateRequest,
  ChangeProductStatusRequest,
  CreatePresignedUploadResponse,
  CreateProductRequest,
  CategoryFormDTO,
  CreateShopSectionRequest,
  ProductDetailDTO,
  ProductListDTO,
  ProductMediaDTO,
  SetProductSectionsRequest,
  ShopSectionDTO,
  ShopTaxonomyDTO,
  UpdateMediaRequest,
  UpdateProductRequest,
  UpdateShopSectionRequest,
} from "@effy/shared-types"

import { api } from "@/lib/api"

import type {
  CategoryForm,
  ProductDetail,
  ProductList,
  ProductListParams,
  ProductMedia,
  ShopSection,
  ShopTaxonomy,
} from "./model"

export function encodeProductListQuery(p: ProductListParams): string {
  const params = new URLSearchParams()
  params.set("page", String(p.page))
  params.set("pageSize", String(p.pageSize))
  if (p.q && p.q.trim()) params.set("q", p.q.trim())
  if (p.category) params.set("category", p.category)
  if (p.section) params.set("section", p.section)
  if (p.status) params.set("status", p.status)
  if (p.reviewState) params.set("reviewState", p.reviewState)
  if (p.missing) params.set("missing", "true")
  if (p.priceMin && p.priceMin.trim()) params.set("priceMin", p.priceMin.trim())
  if (p.priceMax && p.priceMax.trim()) params.set("priceMax", p.priceMax.trim())
  if (p.sort) params.set("sort", p.sort)
  if (p.order) params.set("dir", p.order)
  return params.toString()
}

/** One page of the catalogue for the address's view (103). */
export function fetchProductPage(qs: URLSearchParams, signal: AbortSignal): Promise<ProductList> {
  return api.get<ProductListDTO>(`/shop/v1/products?${qs}`, { signal })
}

/** Every active category (paths, synonyms, icons) and the shop's recently used leaves (101). */
export async function getShopTaxonomy(): Promise<ShopTaxonomy> {
  return api.get<ShopTaxonomyDTO>("/shop/v1/catalog/categories")
}

/** A leaf's resolved form: the details step is built from it. */
export async function getCategoryForm(categoryId: string): Promise<CategoryForm> {
  return api.get<CategoryFormDTO>(`/shop/v1/catalog/categories/${categoryId}/form`)
}

export async function listProducts(params: ProductListParams): Promise<ProductList> {
  return api.get<ProductListDTO>(`/shop/v1/products?${encodeProductListQuery(params)}`)
}

export async function getProduct(id: string): Promise<ProductDetail> {
  return api.get<ProductDetailDTO>(`/shop/v1/products/${id}`)
}

export async function createProduct(body: CreateProductRequest): Promise<ProductDetail> {
  return api.post<ProductDetailDTO>("/shop/v1/products", body)
}

export async function updateProduct(id: string, body: UpdateProductRequest): Promise<ProductDetail> {
  return api.patch<ProductDetailDTO>(`/shop/v1/products/${id}`, body)
}

export async function changeProductStatus(id: string, body: ChangeProductStatusRequest): Promise<ProductDetail> {
  return api.post<ProductDetailDTO>(`/shop/v1/products/${id}/status`, body)
}

export async function setVariantState(
  productId: string,
  variantId: string,
  body: SetVariantStateRequest,
): Promise<ProductDetail> {
  return api.post<ProductDetailDTO>(`/shop/v1/products/${productId}/variants/${variantId}/state`, body)
}

export async function submitProductForReview(id: string): Promise<ProductDetail> {
  return api.post<ProductDetailDTO>(`/shop/v1/products/${id}/submit`, {})
}

export async function withdrawProductReview(id: string): Promise<ProductDetail> {
  return api.post<ProductDetailDTO>(`/shop/v1/products/${id}/withdraw`, {})
}

export async function deleteProduct(id: string): Promise<void> {
  return api.delete<void>(`/shop/v1/products/${id}`)
}

export async function setProductSections(id: string, body: SetProductSectionsRequest): Promise<ProductDetail> {
  return api.patch<ProductDetailDTO>(`/shop/v1/products/${id}/sections`, body)
}

async function presignUpload(productId: string, file: File): Promise<CreatePresignedUploadResponse> {
  return api.post<CreatePresignedUploadResponse>(`/shop/v1/products/${productId}/media`, {
    contentType: file.type,
    fileSize: file.size,
  })
}

function putToStorage(uploadUrl: string, file: File, onProgress?: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", uploadUrl)
    xhr.setRequestHeader("content-type", file.type)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`))
    xhr.onerror = () => reject(new Error("Upload failed"))
    xhr.send(file)
  })
}

async function registerMedia(
  productId: string,
  storageKey: string,
  opts: { isPrimary?: boolean; altText?: string | null } = {},
): Promise<ProductMediaDTO> {
  return api.post<ProductMediaDTO>(`/shop/v1/products/${productId}/media/register`, {
    storageKey,
    isPrimary: opts.isPrimary,
    altText: opts.altText ?? null,
  })
}

export async function uploadProductMedia(
  productId: string,
  file: File,
  opts: { isPrimary?: boolean; altText?: string | null; onProgress?: (p: number) => void } = {},
): Promise<ProductMediaDTO> {
  const { uploadUrl, storageKey } = await presignUpload(productId, file)
  await putToStorage(uploadUrl, file, opts.onProgress)
  return registerMedia(productId, storageKey, { isPrimary: opts.isPrimary, altText: opts.altText })
}

export async function updateProductMedia(
  productId: string,
  mediaId: string,
  body: UpdateMediaRequest,
): Promise<ProductMedia> {
  return api.patch<ProductMediaDTO>(`/shop/v1/products/${productId}/media/${mediaId}`, body)
}

export async function deleteProductMedia(productId: string, mediaId: string): Promise<void> {
  return api.delete<void>(`/shop/v1/products/${productId}/media/${mediaId}`)
}

export async function listSections(): Promise<ShopSection[]> {
  return api.get<ShopSectionDTO[]>("/shop/v1/sections")
}

export async function createSection(body: CreateShopSectionRequest): Promise<ShopSection> {
  return api.post<ShopSectionDTO>("/shop/v1/sections", body)
}

export async function updateSection(id: string, body: UpdateShopSectionRequest): Promise<ShopSection> {
  return api.patch<ShopSectionDTO>(`/shop/v1/sections/${id}`, body)
}

export async function deleteSection(id: string): Promise<void> {
  return api.delete<void>(`/shop/v1/sections/${id}`)
}
