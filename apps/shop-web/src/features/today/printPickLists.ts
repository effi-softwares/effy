import type { ShopPickListsDTO } from "@effy/shared-types"

import { printPickLists as printDocuments } from "@/features/fulfillment/pickList"

import { api } from "@/lib/api"

/**
 * Print one pick list per waiting order (058, US4/FR-013).
 *
 * ⚠ IT USES THE ORDER DETAIL'S RENDERER, not a second one (T010). A picker must not be able to end
 * up holding two differently-shaped sheets for the same order depending on who printed it.
 *
 * ⚠ IT RETURNS WHAT WAS ACTUALLY SENT. The toast says "{n} pick lists sent to printer", and that
 * sentence has to be true — including when a popup blocker silently swallowed the window, which is
 * the one failure the operator cannot see for themselves.
 */
export async function printAwaitingPickLists(): Promise<{ printed: number; more: number }> {
  const data = await api.get<ShopPickListsDTO>("/shop/v1/pick-lists")

  const printed = printDocuments(
    data.lists.map((l) => ({
      orderNumber: l.orderNumber,
      recipientName: l.customerName,
      deliveryMethod: l.deliveryMethod,
      readyBy: null,
      lines: l.lines.map((line) => ({
        name: line.name,
        sku: line.sku,
        quantity: line.quantity,
      })),
    })),
    "Pick lists",
  )

  return { printed, more: data.more }
}
