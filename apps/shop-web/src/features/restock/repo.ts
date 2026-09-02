import type {
  CreatePurchaseOrderRequest,
  CreateSupplierRequest,
  PurchaseOrderDTO,
  PurchaseOrderSummaryDTO,
  ReceivePurchaseOrderRequest,
  SupplierDTO,
  UpdatePurchaseOrderRequest,
  UpdateSupplierRequest,
} from "@effy/shared-types"

import { api } from "@/lib/api"

// Suppliers + purchase orders (057 US6) — cold path, on the shared gateway. Every route is
// shop-scoped server-side; no shop identifier is ever sent.

export const listSuppliers = () => api.get<SupplierDTO[]>("/shop/v1/suppliers")

export const createSupplier = (body: CreateSupplierRequest) =>
  api.post<SupplierDTO>("/shop/v1/suppliers", body)

export const updateSupplier = (id: string, body: UpdateSupplierRequest) =>
  api.patch<SupplierDTO>(`/shop/v1/suppliers/${id}`, body)

export const archiveSupplier = (id: string) => api.delete<void>(`/shop/v1/suppliers/${id}`)

/** ⚠ `null` clears the assignment — an ordinary state, not a missing value. */
export const setProductSupplier = (productId: string, supplierId: string | null) =>
  api.patch<void>(`/shop/v1/products/${productId}/supplier`, { supplierId })

export const listPurchaseOrders = () =>
  api.get<PurchaseOrderSummaryDTO[]>("/shop/v1/purchase-orders")

export const getPurchaseOrder = (id: string) =>
  api.get<PurchaseOrderDTO>(`/shop/v1/purchase-orders/${id}`)

export const createPurchaseOrder = (body: CreatePurchaseOrderRequest) =>
  api.post<PurchaseOrderDTO>("/shop/v1/purchase-orders", body)

export const updatePurchaseOrder = (id: string, body: UpdatePurchaseOrderRequest) =>
  api.patch<PurchaseOrderDTO>(`/shop/v1/purchase-orders/${id}`, body)

/** ⚠ Quantities are ABSOLUTE cumulative totals, never deltas — a retry books the pallet once. */
export const receivePurchaseOrder = (id: string, body: ReceivePurchaseOrderRequest) =>
  api.post<PurchaseOrderDTO>(`/shop/v1/purchase-orders/${id}/receive`, body)
