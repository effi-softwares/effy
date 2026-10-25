import type { ShopPickListsDTO } from "@effy/shared-types"

import { printPickLists as printDocuments } from "@/features/fulfillment/pickList"

import { api } from "@/lib/api"

export async function printAwaitingPickLists(): Promise<{ printed: number; more: number }> {
  const data = await api.get<ShopPickListsDTO>("/shop/v1/pick-lists")

  const printed = printDocuments(
    data.lists.map((l) => ({
      orderNumber: l.orderNumber,
      recipientName: l.customerName,
      deliveredBy: l.deliveredBy,
      readyBy: null,
      lines: l.lines.map((line) => ({
        name: line.name,
        // The size and its codes: a picker must never guess which pack.
        variantLabel: line.variantLabel ?? null,
        variantCode: line.variantCode ?? null,
        sku: line.sku,
        quantity: line.quantity,
        storageClass: line.storageClass,
      })),
    })),
    "Pick lists",
  )

  return { printed, more: data.more }
}
