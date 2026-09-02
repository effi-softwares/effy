import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type {
  CreatePurchaseOrderRequest,
  CreateSupplierRequest,
  ReceivePurchaseOrderRequest,
  UpdatePurchaseOrderRequest,
  UpdateSupplierRequest,
} from "@effy/shared-types"

import { track } from "@/lib/telemetry"

import * as repo from "./repo"

const ROOT = ["shop", "restock"] as const

export const suppliersQuery = queryOptions({
  queryKey: [...ROOT, "suppliers"] as const,
  queryFn: repo.listSuppliers,
  staleTime: 60_000,
})

export const purchaseOrdersQuery = queryOptions({
  queryKey: [...ROOT, "purchase-orders"] as const,
  queryFn: repo.listPurchaseOrders,
  staleTime: 15_000,
})

export const purchaseOrderQuery = (id: string) =>
  queryOptions({
    queryKey: [...ROOT, "purchase-order", id] as const,
    queryFn: () => repo.getPurchaseOrder(id),
  })

function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ROOT })
    // ⚠ Receiving moves stock, so the restock list and every product's stock panel are stale too.
    // Forgetting this is how an operator receives 24 cases and still sees "out of stock".
    void qc.invalidateQueries({ queryKey: ["shop", "stock"] })
  }
}

export function useCreateSupplier() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: CreateSupplierRequest) => repo.createSupplier(body),
    onSuccess: invalidate,
  })
}

export function useUpdateSupplier() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSupplierRequest }) =>
      repo.updateSupplier(id, body),
    onSuccess: invalidate,
  })
}

export function useArchiveSupplier() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: repo.archiveSupplier, onSuccess: invalidate })
}

/**
 * ⚠ THIS MUTATION SHIPPED WITH 057's US6 AND HAD NO CALL SITE. The restock queue groups by supplier
 * (FR-018) and nothing anywhere could assign one, so every product sat in the "Unassigned" bucket
 * permanently. The product detail screen is where it now lives — the one screen that knows which
 * product the operator means.
 *
 * ⚠ AND IT INVALIDATES THE CATALOG ROOT TOO, which the shared `useInvalidate` does not. The product
 * DETAIL now carries `supplierName` (resolved on read), so without this the operator assigns a
 * supplier, the write succeeds, and the row they are looking at keeps showing the old answer.
 */
export function useSetProductSupplier() {
  const invalidate = useInvalidate()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, supplierId }: { productId: string; supplierId: string | null }) =>
      repo.setProductSupplier(productId, supplierId),
    onSuccess: () => {
      invalidate()
      void qc.invalidateQueries({ queryKey: ["shop", "catalog"] })
    },
  })
}

export function useCreatePurchaseOrder() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: CreatePurchaseOrderRequest) => repo.createPurchaseOrder(body),
    onSuccess: (po) => {
      track({ name: "purchase_order_created", purchaseOrderId: po.id, lineCount: po.lines.length })
      invalidate()
    },
  })
}

export function useUpdatePurchaseOrder(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: UpdatePurchaseOrderRequest) => repo.updatePurchaseOrder(id, body),
    onSuccess: invalidate,
  })
}

export function useReceivePurchaseOrder(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: ReceivePurchaseOrderRequest) => repo.receivePurchaseOrder(id, body),
    onSuccess: (po) => {
      track({
        name: "purchase_order_received",
        purchaseOrderId: po.id,
        complete: po.status === "received",
      })
      invalidate()
    },
  })
}
