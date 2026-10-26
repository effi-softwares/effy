import type {
  AttachmentInput,
  AttributeDTO,
  AttributeInput,
  CategoryFormDTO,
  CategoryImageUploadResponse,
  CreateCategoryRequest,
  MoveCategoryRequest,
  SetCategoryStatusRequest,
  TaxonomyCategoryDTO,
  TaxonomyStatus,
  TaxonomyTreeDTO,
  UpdateAttributeRequest,
  UpdateCategoryRequest,
} from "@effy/shared-types"

import { api } from "@/lib/api"

const BASE = "/catalog/v1/taxonomy"

export async function getTree(): Promise<TaxonomyCategoryDTO[]> {
  return (await api.get<TaxonomyTreeDTO>(`${BASE}/categories`)).categories
}

export async function createCategory(body: CreateCategoryRequest): Promise<TaxonomyCategoryDTO> {
  return api.post<TaxonomyCategoryDTO>(`${BASE}/categories`, body)
}

export async function updateCategory(id: string, body: UpdateCategoryRequest): Promise<TaxonomyCategoryDTO> {
  return api.patch<TaxonomyCategoryDTO>(`${BASE}/categories/${id}`, body)
}

export async function moveCategory(id: string, body: MoveCategoryRequest): Promise<TaxonomyCategoryDTO[]> {
  return (await api.post<TaxonomyTreeDTO>(`${BASE}/categories/${id}/move`, body)).categories
}

export async function setCategoryStatus(id: string, body: SetCategoryStatusRequest): Promise<TaxonomyCategoryDTO> {
  return api.post<TaxonomyCategoryDTO>(`${BASE}/categories/${id}/status`, body)
}

/** Presign, upload the file straight to storage, and return its key for `updateCategory`. */
export async function uploadCategoryImage(id: string, file: File): Promise<string> {
  const target = await api.post<CategoryImageUploadResponse>(`${BASE}/categories/${id}/image`, {
    contentType: file.type,
    fileSize: file.size,
  })
  const res = await fetch(target.uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type } })
  if (!res.ok) throw new Error(`upload failed (${res.status})`)
  return target.imageKey
}

export async function getForm(id: string): Promise<CategoryFormDTO> {
  return api.get<CategoryFormDTO>(`${BASE}/categories/${id}/form`)
}

export async function putAttachment(
  categoryId: string,
  attributeId: string,
  body: AttachmentInput,
): Promise<CategoryFormDTO> {
  return api.put<CategoryFormDTO>(`${BASE}/categories/${categoryId}/attributes/${attributeId}`, body)
}

export async function deleteAttachment(categoryId: string, attributeId: string): Promise<CategoryFormDTO> {
  return api.delete<CategoryFormDTO>(`${BASE}/categories/${categoryId}/attributes/${attributeId}`)
}

export async function listAttributes(): Promise<AttributeDTO[]> {
  return api.get<AttributeDTO[]>(`${BASE}/attributes`)
}

export async function createAttribute(body: AttributeInput): Promise<AttributeDTO> {
  return api.post<AttributeDTO>(`${BASE}/attributes`, body)
}

export async function updateAttribute(id: string, body: UpdateAttributeRequest): Promise<AttributeDTO> {
  return api.patch<AttributeDTO>(`${BASE}/attributes/${id}`, body)
}

export async function setAttributeStatus(id: string, status: TaxonomyStatus): Promise<AttributeDTO> {
  return api.post<AttributeDTO>(`${BASE}/attributes/${id}/status`, { status })
}
