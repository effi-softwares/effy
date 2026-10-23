import type { ShopPickListsDTO } from "@effy/shared-types"

import { printPickLists as printDocuments } from "@/features/fulfillment/pickList"

import { api } from "@/lib/api"

/**
 * Print one pick list per waiting order.
 *
 * It uses the order detail's renderer, not a second one. A picker must not be able to end
 * up holding two differently-shaped sheets for the same order depending on who printed it.
 *
 * It returns what was actually sent. The toast says "{n} pick lists sent to printer", and that
 * sentence has to be true — including when a popup blocker silently swallowed the window, which is
 * the one failure the operator cannot see for themselves.
 */
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
      })),
    })),
    "Pick lists",
  )

  return { printed, more: data.more }
}
