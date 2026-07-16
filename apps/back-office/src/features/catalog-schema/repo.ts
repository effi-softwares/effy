import type {
  AssignAttributeRequest,
  AttributeDefinitionDTO,
  CategoryDTO,
  ChangeSchemaStatusRequest,
  CreateAttributeDefinitionRequest,
  CreateCategoryRequest,
  CreateProductTypeRequest,
  ProductTypeDTO,
  UpdateAssignmentRequest,
  UpdateAttributeDefinitionRequest,
  UpdateCategoryRequest,
  UpdateProductTypeRequest,
} from "@effy/shared-types";

import { api } from "@/lib/api";

import type {
  AttributeDefinition,
  Category,
  ProductType,
} from "./model";

// The data layer for the back-office catalog schema authority. Every call maps DTO→domain (identity
// map here, since the contracts double as the domain shapes) so screens never touch the api client
// directly (Principle VI). All endpoints live under the admin cold-path service behind the shared
// gateway at `/admin/v1/catalog/*` (contracts/admin-catalog.contract.md).

const BASE = "/admin/v1/catalog";

// ── Product types ───────────────────────────────────────────────────────────────────────────────

export async function listProductTypes(): Promise<ProductType[]> {
  return api.get<ProductTypeDTO[]>(`${BASE}/product-types`);
}

export async function getProductType(id: string): Promise<ProductType> {
  return api.get<ProductTypeDTO>(`${BASE}/product-types/${id}`);
}

export async function createProductType(body: CreateProductTypeRequest): Promise<ProductType> {
  return api.post<ProductTypeDTO>(`${BASE}/product-types`, body);
}

export async function updateProductType(
  id: string,
  body: UpdateProductTypeRequest,
): Promise<ProductType> {
  return api.patch<ProductTypeDTO>(`${BASE}/product-types/${id}`, body);
}

export async function changeProductTypeStatus(
  id: string,
  body: ChangeSchemaStatusRequest,
): Promise<ProductType> {
  return api.post<ProductTypeDTO>(`${BASE}/product-types/${id}/status`, body);
}

export async function assignAttribute(
  id: string,
  body: AssignAttributeRequest,
): Promise<ProductType> {
  return api.post<ProductTypeDTO>(`${BASE}/product-types/${id}/attributes`, body);
}

export async function updateAssignment(
  id: string,
  attrId: string,
  body: UpdateAssignmentRequest,
): Promise<ProductType> {
  return api.patch<ProductTypeDTO>(`${BASE}/product-types/${id}/attributes/${attrId}`, body);
}

export async function unassignAttribute(id: string, attrId: string): Promise<void> {
  await api.delete<void>(`${BASE}/product-types/${id}/attributes/${attrId}`);
}

// ── Attribute definitions ─────────────────────────────────────────────────────────────────────

export async function listAttributes(): Promise<AttributeDefinition[]> {
  return api.get<AttributeDefinitionDTO[]>(`${BASE}/attributes`);
}

export async function getAttribute(id: string): Promise<AttributeDefinition> {
  return api.get<AttributeDefinitionDTO>(`${BASE}/attributes/${id}`);
}

export async function createAttribute(
  body: CreateAttributeDefinitionRequest,
): Promise<AttributeDefinition> {
  return api.post<AttributeDefinitionDTO>(`${BASE}/attributes`, body);
}

export async function updateAttribute(
  id: string,
  body: UpdateAttributeDefinitionRequest,
): Promise<AttributeDefinition> {
  return api.patch<AttributeDefinitionDTO>(`${BASE}/attributes/${id}`, body);
}

export async function changeAttributeStatus(
  id: string,
  body: ChangeSchemaStatusRequest,
): Promise<AttributeDefinition> {
  return api.post<AttributeDefinitionDTO>(`${BASE}/attributes/${id}/status`, body);
}

export async function deleteAllowedValue(id: string, valueId: string): Promise<void> {
  await api.delete<void>(`${BASE}/attributes/${id}/allowed-values/${valueId}`);
}

// ── Categories (taxonomy) ─────────────────────────────────────────────────────────────────────

export async function listCategories(): Promise<Category[]> {
  return api.get<CategoryDTO[]>(`${BASE}/categories`);
}

export async function createCategory(body: CreateCategoryRequest): Promise<Category> {
  return api.post<CategoryDTO>(`${BASE}/categories`, body);
}

export async function updateCategory(
  id: string,
  body: UpdateCategoryRequest,
): Promise<Category> {
  return api.patch<CategoryDTO>(`${BASE}/categories/${id}`, body);
}

export async function changeCategoryStatus(
  id: string,
  body: ChangeSchemaStatusRequest,
): Promise<Category> {
  return api.post<CategoryDTO>(`${BASE}/categories/${id}/status`, body);
}
