import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

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
} from "@effy/shared-types";

import {
  assignAttribute,
  changeAttributeStatus,
  changeCategoryStatus,
  changeProductTypeStatus,
  createAttribute,
  createCategory,
  createProductType,
  deleteAllowedValue,
  getAttribute,
  getProductType,
  listAttributes,
  listCategories,
  listProductTypes,
  unassignAttribute,
  updateAssignment,
  updateAttribute,
  updateCategory,
  updateProductType,
} from "./repo";

// Server state lives ONLY in the TanStack Query cache (Principle VI). Each list/detail query keys
// on the entity + id; mutations invalidate the whole catalog root — a schema write can move data
// across all three tables at once (assigning an attribute changes both the type and the attribute's
// in-use count; retiring a category or attribute is validated against products), so a coarse
// invalidation is correct and cheap here (mirrors features/shops/queries.ts).

const CATALOG_ROOT = ["back-office", "catalog-schema"] as const;

export const productTypesQuery = () =>
  queryOptions({
    queryKey: [...CATALOG_ROOT, "product-types", "list"] as const,
    queryFn: () => listProductTypes(),
  });

export const productTypeQuery = (id: string) =>
  queryOptions({
    queryKey: [...CATALOG_ROOT, "product-types", "detail", id] as const,
    queryFn: () => getProductType(id),
  });

export const attributesQuery = () =>
  queryOptions({
    queryKey: [...CATALOG_ROOT, "attributes", "list"] as const,
    queryFn: () => listAttributes(),
  });

export const attributeQuery = (id: string) =>
  queryOptions({
    queryKey: [...CATALOG_ROOT, "attributes", "detail", id] as const,
    queryFn: () => getAttribute(id),
  });

export const categoriesQuery = () =>
  queryOptions({
    queryKey: [...CATALOG_ROOT, "categories", "list"] as const,
    queryFn: () => listCategories(),
  });

function invalidateCatalog(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: CATALOG_ROOT });
}

// ── Product-type mutations ────────────────────────────────────────────────────────────────────

export function useCreateProductType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProductTypeRequest) => createProductType(body),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useUpdateProductType(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProductTypeRequest) => updateProductType(id, body),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useChangeProductTypeStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangeSchemaStatusRequest) => changeProductTypeStatus(id, body),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useAssignAttribute(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AssignAttributeRequest) => assignAttribute(id, body),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useUpdateAssignment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ attrId, body }: { attrId: string; body: UpdateAssignmentRequest }) =>
      updateAssignment(id, attrId, body),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useUnassignAttribute(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attrId: string) => unassignAttribute(id, attrId),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

// ── Attribute-definition mutations ────────────────────────────────────────────────────────────

export function useCreateAttribute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAttributeDefinitionRequest) => createAttribute(body),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useUpdateAttribute(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateAttributeDefinitionRequest) => updateAttribute(id, body),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useChangeAttributeStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangeSchemaStatusRequest) => changeAttributeStatus(id, body),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useDeleteAllowedValue(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (valueId: string) => deleteAllowedValue(id, valueId),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

// ── Category mutations ────────────────────────────────────────────────────────────────────────

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCategoryRequest) => createCategory(body),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useUpdateCategory(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateCategoryRequest) => updateCategory(id, body),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useChangeCategoryStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangeSchemaStatusRequest) => changeCategoryStatus(id, body),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}
