import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  ChangeProductStatusRequest,
  CreateProductRequest,
  CreateShopSectionRequest,
  SetProductSectionsRequest,
  UpdateMediaRequest,
  UpdateProductRequest,
  UpdateShopSectionRequest,
} from "@effy/shared-types";

import {
  changeProductStatus,
  createProduct,
  createSection,
  deleteProduct,
  deleteProductMedia,
  deleteSection,
  getCatalogSchema,
  getProduct,
  listProducts,
  listSections,
  setProductSections,
  updateProduct,
  updateProductMedia,
  updateSection,
  uploadProductMedia,
} from "./repo";
import type { ProductListParams } from "./model";

// Server state lives ONLY in the TanStack Query cache (Principle VI). The list query is keyed on its
// params so each page/filter/search combination caches independently; mutations invalidate the
// affected keys rather than hand-patching cached rows.

const CATALOG_ROOT = ["shop", "catalog"] as const;

/** The schema drives the create form AND the list filter selects — cache it a while; it changes
 *  only when the back office edits the taxonomy. */
export const catalogSchemaQuery = queryOptions({
  queryKey: [...CATALOG_ROOT, "schema"] as const,
  queryFn: getCatalogSchema,
  staleTime: 5 * 60_000,
});

export const productListQuery = (params: ProductListParams) =>
  queryOptions({
    queryKey: [...CATALOG_ROOT, "products", params] as const,
    queryFn: () => listProducts(params),
  });

export const productDetailQuery = (id: string) =>
  queryOptions({
    queryKey: [...CATALOG_ROOT, "product", id] as const,
    queryFn: () => getProduct(id),
  });

/** The shop's own sections — the create/detail section pickers and the list filter all read this. */
export const sectionsQuery = queryOptions({
  queryKey: [...CATALOG_ROOT, "sections"] as const,
  queryFn: listSections,
  staleTime: 5 * 60_000,
});

/** Invalidate the whole product list — a new/changed product changes counts and every filtered page. */
function invalidateProducts(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: [...CATALOG_ROOT, "products"] });
}

/** Invalidate one product's detail — after a focused edit / status change / media or section write. */
function invalidateDetail(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  void queryClient.invalidateQueries({ queryKey: [...CATALOG_ROOT, "product", id] });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProductRequest) => createProduct(body),
    onSuccess: () => invalidateProducts(queryClient),
  });
}

// ── US4: focused edit + media ─────────────────────────────────────────────────────────────────

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProductRequest) => updateProduct(id, body),
    onSuccess: () => {
      invalidateDetail(queryClient, id);
      invalidateProducts(queryClient);
    },
  });
}

export function useUploadMedia(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      file: File;
      isPrimary?: boolean;
      onProgress?: (p: number) => void;
    }) => uploadProductMedia(id, args.file, { isPrimary: args.isPrimary, onProgress: args.onProgress }),
    onSuccess: () => {
      invalidateDetail(queryClient, id);
      invalidateProducts(queryClient);
    },
  });
}

export function useUpdateMedia(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { mediaId: string; body: UpdateMediaRequest }) =>
      updateProductMedia(id, args.mediaId, args.body),
    onSuccess: () => {
      invalidateDetail(queryClient, id);
      invalidateProducts(queryClient);
    },
  });
}

export function useDeleteMedia(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mediaId: string) => deleteProductMedia(id, mediaId),
    onSuccess: () => {
      invalidateDetail(queryClient, id);
      invalidateProducts(queryClient);
    },
  });
}

// ── US5: lifecycle + sections ─────────────────────────────────────────────────────────────────

export function useChangeStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangeProductStatusRequest) => changeProductStatus(id, body),
    onSuccess: () => {
      invalidateDetail(queryClient, id);
      invalidateProducts(queryClient);
    },
  });
}

export function useDeleteProduct(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteProduct(id),
    onSuccess: () => invalidateProducts(queryClient),
  });
}

export function useSetProductSections(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SetProductSectionsRequest) => setProductSections(id, body),
    onSuccess: () => {
      invalidateDetail(queryClient, id);
      invalidateProducts(queryClient);
    },
  });
}

function invalidateSections(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: [...CATALOG_ROOT, "sections"] });
}

export function useCreateSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateShopSectionRequest) => createSection(body),
    onSuccess: () => invalidateSections(queryClient),
  });
}

export function useUpdateSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: UpdateShopSectionRequest }) =>
      updateSection(args.id, args.body),
    onSuccess: () => invalidateSections(queryClient),
  });
}

export function useDeleteSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSection(id),
    onSuccess: () => {
      invalidateSections(queryClient);
      // A deleted section unassigns products via cascade — refresh their lists/detail too.
      invalidateProducts(queryClient);
    },
  });
}
