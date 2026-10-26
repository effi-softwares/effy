import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type {
  AttachmentInput,
  AttributeInput,
  CreateCategoryRequest,
  MoveCategoryRequest,
  SetCategoryStatusRequest,
  TaxonomyStatus,
  UpdateAttributeRequest,
  UpdateCategoryRequest,
} from "@effy/shared-types"

import * as repo from "./repo"

export const taxonomyKeys = {
  all: ["taxonomy"] as const,
  tree: ["taxonomy", "tree"] as const,
  form: (id: string) => ["taxonomy", "form", id] as const,
  attributes: ["taxonomy", "attributes"] as const,
}

export const treeQuery = () => queryOptions({ queryKey: taxonomyKeys.tree, queryFn: repo.getTree })

export const formQuery = (id: string) =>
  queryOptions({ queryKey: taxonomyKeys.form(id), queryFn: () => repo.getForm(id) })

export const attributesQuery = () => queryOptions({ queryKey: taxonomyKeys.attributes, queryFn: repo.listAttributes })

/** Any taxonomy write can change the tree, every form beneath it and the library's usage: re-read them all. */
function useTaxonomyMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: taxonomyKeys.all }) })
}

export const useCreateCategory = () => useTaxonomyMutation((body: CreateCategoryRequest) => repo.createCategory(body))

export const useUpdateCategory = () =>
  useTaxonomyMutation(({ id, body }: { id: string; body: UpdateCategoryRequest }) => repo.updateCategory(id, body))

export const useMoveCategory = () =>
  useTaxonomyMutation(({ id, body }: { id: string; body: MoveCategoryRequest }) => repo.moveCategory(id, body))

export const useSetCategoryStatus = () =>
  useTaxonomyMutation(({ id, body }: { id: string; body: SetCategoryStatusRequest }) =>
    repo.setCategoryStatus(id, body),
  )

export const useUploadCategoryImage = () =>
  useTaxonomyMutation(async ({ id, file }: { id: string; file: File }) => {
    const imageKey = await repo.uploadCategoryImage(id, file)
    return repo.updateCategory(id, { imageKey })
  })

export const usePutAttachment = () =>
  useTaxonomyMutation(
    ({ categoryId, attributeId, body }: { categoryId: string; attributeId: string; body: AttachmentInput }) =>
      repo.putAttachment(categoryId, attributeId, body),
  )

export const useDeleteAttachment = () =>
  useTaxonomyMutation(({ categoryId, attributeId }: { categoryId: string; attributeId: string }) =>
    repo.deleteAttachment(categoryId, attributeId),
  )

export const useCreateAttribute = () => useTaxonomyMutation((body: AttributeInput) => repo.createAttribute(body))

export const useUpdateAttribute = () =>
  useTaxonomyMutation(({ id, body }: { id: string; body: UpdateAttributeRequest }) => repo.updateAttribute(id, body))

export const useSetAttributeStatus = () =>
  useTaxonomyMutation(({ id, status }: { id: string; status: TaxonomyStatus }) => repo.setAttributeStatus(id, status))
