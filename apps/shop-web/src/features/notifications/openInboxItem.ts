import type { useQueryClient } from "@tanstack/react-query"

import { parseDestination, shopPathFor, type InboxItemDTO, type ShopDestination } from "@effy/shared-types"

import { track } from "@/lib/telemetry"

import { markNotificationRead } from "./api"
import { markLocallyRead } from "./inbox-api"

/** The operator's notifications page. */
export const INBOX_PATH = "/notifications"

/** A message from Effy (112) is read where it is: its words and picture, then a button to where it leads. */
export const readsInPlace = (item: InboxItemDTO) => item.type === "shop_message"

export const destinationOf = (item: InboxItemDTO) => parseDestination("shop", item.destination) as ShopDestination | null

export interface OpenDeps {
  qc: ReturnType<typeof useQueryClient>
  push: (path: string) => void
  /** The inbox's own reader. Without one (the arrival toast), a message opens the inbox instead. */
  readInPlace?: () => void
}

/**
 * Opening a notification, the one way (120 R8): from the inbox list and from the toast that says it arrived. Records
 * the read and goes where it leads, or shows it in place.
 */
export function openInboxItem(item: InboxItemDTO, deps: OpenDeps): void {
  if (readsInPlace(item) && !deps.readInPlace) return deps.push(INBOX_PATH)
  const destination = destinationOf(item)
  markLocallyRead(deps.qc, item.id)
  track({ name: "notif_inbox_item_opened", type: item.type, category: item.category, fallback: destination === null })
  void markNotificationRead(item.id)
  if (readsInPlace(item)) deps.readInPlace?.()
  else deps.push(shopPathFor(destination))
}
