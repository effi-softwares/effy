import type {
  CatalogSchemaDTO,
  ChangeProductStatusRequest,
  CreatePresignedUploadResponse,
  CreateProductRequest,
  CreateShopSectionRequest,
  ProductDetailDTO,
  ProductListDTO,
  ProductMediaDTO,
  SetProductSectionsRequest,
  ShopSectionDTO,
  UpdateMediaRequest,
  UpdateProductRequest,
  UpdateShopSectionRequest,
} from "@effy/shared-types";

import { api } from "@/lib/api";

import type {
  CatalogSchema,
  ProductDetail,
  ProductList,
  ProductListParams,
  ProductMedia,
  ShopSection,
} from "./model";

// The data layer for shop-web catalog. Every call maps DTO→domain (identity map here, since the
// contracts double as the domain shapes) so screens never touch the api client directly
// (Principle VI). All endpoints live under the shop cold-path service behind the shared gateway,
// scoped server-side to the operator's own shop (never from client input — FR-019/FR-031).

/** Serialize the catalog list params, omitting empties so the cache key and the URL stay tidy. */
export function encodeProductListQuery(p: ProductListParams): string {
  const params = new URLSearchParams();
  params.set("page", String(p.page));
  params.set("pageSize", String(p.pageSize));
  if (p.q && p.q.trim()) params.set("q", p.q.trim());
  if (p.type) params.set("type", p.type);
  if (p.category) params.set("category", p.category);
  if (p.section) params.set("section", p.section);
  if (p.status) params.set("status", p.status);
  if (p.priceMin && p.priceMin.trim()) params.set("priceMin", p.priceMin.trim());
  if (p.priceMax && p.priceMax.trim()) params.set("priceMax", p.priceMax.trim());
  if (p.sort) params.set("sort", p.sort);
  if (p.order) params.set("order", p.order);
  return params.toString();
}

/** One call bootstraps the create form: active types (+ their attributes) and the category tree. */
export async function getCatalogSchema(): Promise<CatalogSchema> {
  return api.get<CatalogSchemaDTO>("/shop/v1/catalog/schema");
}

export async function listProducts(params: ProductListParams): Promise<ProductList> {
  return api.get<ProductListDTO>(`/shop/v1/products?${encodeProductListQuery(params)}`);
}

export async function getProduct(id: string): Promise<ProductDetail> {
  return api.get<ProductDetailDTO>(`/shop/v1/products/${id}`);
}

export async function createProduct(body: CreateProductRequest): Promise<ProductDetail> {
  return api.post<ProductDetailDTO>("/shop/v1/products", body);
}

/**
 * Focused edit (US4). The body carries only the subset of fields the operator changed PLUS the
 * required `expectedUpdatedAt` — the `updatedAt` the client last read (FR-023a). A stale token means
 * the row moved under us: the backend affects 0 rows and returns 409, surfaced to the UI as
 * "changed elsewhere — reload".
 */
export async function updateProduct(
  id: string,
  body: UpdateProductRequest,
): Promise<ProductDetail> {
  return api.patch<ProductDetailDTO>(`/shop/v1/products/${id}`, body);
}

/** Lifecycle transition (US5). Publish (→active) re-validates mandatory fields → 400 field errors. */
export async function changeProductStatus(
  id: string,
  body: ChangeProductStatusRequest,
): Promise<ProductDetail> {
  return api.post<ProductDetailDTO>(`/shop/v1/products/${id}/status`, body);
}

/** Hard delete (US5). The backend refuses (409 "archive instead") anything but an unreferenced draft. */
export async function deleteProduct(id: string): Promise<void> {
  return api.delete<void>(`/shop/v1/products/${id}`);
}

/** Set a product's whole section membership (US5) — the backend replaces, not merges. */
export async function setProductSections(
  id: string,
  body: SetProductSectionsRequest,
): Promise<ProductDetail> {
  return api.patch<ProductDetailDTO>(`/shop/v1/products/${id}/sections`, body);
}

// ── Media (presigned direct-to-S3) ──────────────────────────────────────────────────────────────

/** Ask the backend for a presigned PUT (validates content-type + size server-side, FR-026). */
async function presignUpload(
  productId: string,
  file: File,
): Promise<CreatePresignedUploadResponse> {
  return api.post<CreatePresignedUploadResponse>(`/shop/v1/products/${productId}/media`, {
    contentType: file.type,
    fileSize: file.size,
  });
}

/**
 * PUT the raw bytes straight to S3 with progress. Deliberately NOT via the api client: this request
 * carries no Effy bearer (the presigned URL is the credential) and must send the file body verbatim
 * with the content-type S3 signed for. XHR (not fetch) is used only because it exposes upload
 * progress, which the contract asks the UI to show.
 */
function putToStorage(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("content-type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

/** Record the uploaded object against the product (optionally as the primary image). */
async function registerMedia(
  productId: string,
  storageKey: string,
  opts: { isPrimary?: boolean; altText?: string | null } = {},
): Promise<ProductMediaDTO> {
  return api.post<ProductMediaDTO>(`/shop/v1/products/${productId}/media/register`, {
    storageKey,
    isPrimary: opts.isPrimary,
    altText: opts.altText ?? null,
  });
}

/**
 * The full three-step media upload for one file: presign → PUT to S3 → register.
 * Reusable by the create flow (attaches the primary image right after the product row exists) and
 * later by US4's media gallery.
 */
export async function uploadProductMedia(
  productId: string,
  file: File,
  opts: { isPrimary?: boolean; altText?: string | null; onProgress?: (p: number) => void } = {},
): Promise<ProductMediaDTO> {
  const { uploadUrl, storageKey } = await presignUpload(productId, file);
  await putToStorage(uploadUrl, file, opts.onProgress);
  return registerMedia(productId, storageKey, { isPrimary: opts.isPrimary, altText: opts.altText });
}

/** Reorder / set-primary / retitle one media object (US4 gallery). */
export async function updateProductMedia(
  productId: string,
  mediaId: string,
  body: UpdateMediaRequest,
): Promise<ProductMedia> {
  return api.patch<ProductMediaDTO>(`/shop/v1/products/${productId}/media/${mediaId}`, body);
}

/** Remove one media object; the backend refuses the last/primary image of an active product (400). */
export async function deleteProductMedia(productId: string, mediaId: string): Promise<void> {
  return api.delete<void>(`/shop/v1/products/${productId}/media/${mediaId}`);
}

// ── Shop sections (shop-local grouping — US5) ─────────────────────────────────────────────────────

export async function listSections(): Promise<ShopSection[]> {
  return api.get<ShopSectionDTO[]>("/shop/v1/sections");
}

export async function createSection(body: CreateShopSectionRequest): Promise<ShopSection> {
  return api.post<ShopSectionDTO>("/shop/v1/sections", body);
}

export async function updateSection(
  id: string,
  body: UpdateShopSectionRequest,
): Promise<ShopSection> {
  return api.patch<ShopSectionDTO>(`/shop/v1/sections/${id}`, body);
}

export async function deleteSection(id: string): Promise<void> {
  return api.delete<void>(`/shop/v1/sections/${id}`);
}
