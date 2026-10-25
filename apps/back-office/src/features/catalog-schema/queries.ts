import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type {
  AssignAttributeRequest,
  ChangeSchemaStatusRequest,
  CreateAttributeDefinitionRequest,
  CreateCategoryRequest,
  CreateProductTypeRequest,
  UpdateAssignmentRequest,
  UpdateAttributeDefinitionRequest,
  UpdateCategoryRequest,
  UpdateProductTypeRequest,
} from "@effy/shared-types"

import {
  assignAttribute,
  changeAttributeStatus,
  changeCategoryStatus,
  changeProductTypeStatus,
  createAttribute,
  createCategory,
  createProductType,
  deleteAllowedValue,
  listAttributes,
  listCategories,
  listProductTypes,
  unassignAttribute,
  updateAssignment,
  updateAttribute,
  updateCategory,
  updateProductType,
} from "./repo"

const CATALOG_ROOT = ["back-office", "catalog-schema"] as const

export const productTypesQuery = () =>
  queryOptions({
    queryKey: [...CATALOG_ROOT, "product-types", "list"] as const,
    queryFn: () => listProductTypes(),
  })

export const attributesQuery = () =>
  queryOptions({
    queryKey: [...CATALOG_ROOT, "attributes", "list"] as const,
    queryFn: () => listAttributes(),
  })

export const categoriesQuery = () =>
  queryOptions({
    queryKey: [...CATALOG_ROOT, "categories", "list"] as const,
    queryFn: () => listCategories(),
  })

function invalidateCatalog(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: CATALOG_ROOT })
}

export function useCreateProductType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateProductTypeRequest) => createProductType(body),
    onSuccess: () => invalidateCatalog(queryClient),
  })
}

export function useUpdateProductType(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateProductTypeRequest) => updateProductType(id, body),
    onSuccess: () => invalidateCatalog(queryClient),
  })
}

export function useChangeProductTypeStatus(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ChangeSchemaStatusRequest) => changeProductTypeStatus(id, body),
    onSuccess: () => invalidateCatalog(queryClient),
  })
}

export function useAssignAttribute(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: AssignAttributeRequest) => assignAttribute(id, body),
    onSuccess: () => invalidateCatalog(queryClient),
  })
}

export function useUpdateAssignment(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ attrId, body }: { attrId: string; body: UpdateAssignmentRequest }) =>
      updateAssignment(id, attrId, body),
    onSuccess: () => invalidateCatalog(queryClient),
  })
}

export function useUnassignAttribute(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (attrId: string) => unassignAttribute(id, attrId),
    onSuccess: () => invalidateCatalog(queryClient),
  })
}

export function useCreateAttribute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateAttributeDefinitionRequest) => createAttribute(body),
    onSuccess: () => invalidateCatalog(queryClient),
  })
}

export function useUpdateAttribute(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateAttributeDefinitionRequest) => updateAttribute(id, body),
    onSuccess: () => invalidateCatalog(queryClient),
  })
}

export function useChangeAttributeStatus(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ChangeSchemaStatusRequest) => changeAttributeStatus(id, body),
    onSuccess: () => invalidateCatalog(queryClient),
  })
}

export function useDeleteAllowedValue(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (valueId: string) => deleteAllowedValue(id, valueId),
    onSuccess: () => invalidateCatalog(queryClient),
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCategoryRequest) => createCategory(body),
    onSuccess: () => invalidateCatalog(queryClient),
  })
}

export function useUpdateCategory(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateCategoryRequest) => updateCategory(id, body),
    onSuccess: () => invalidateCatalog(queryClient),
  })
}

export function useChangeCategoryStatus(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ChangeSchemaStatusRequest) => changeCategoryStatus(id, body),
    onSuccess: () => invalidateCatalog(queryClient),
  })
}
