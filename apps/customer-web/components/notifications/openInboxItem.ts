import { customerWebPathFor, parseDestination, type CustomerDestination, type InboxItemDTO } from "@effy/shared-types"

import { capture } from "@/lib/telemetry"

/** The customer's notifications page. */
export const INBOX_PATH = "/account/notifications"

export const isMarketing = (category: string) => category === "offers" || category === "news"
/** A message from Effy's team (112): read where it is, with its picture, before going anywhere. */
export const isMessage = (type: string) => type === "customer_message"
export const destinationOf = (item: InboxItemDTO) =>
  parseDestination("customer", item.destination) as CustomerDestination | null

/**
 * 111 FR-024: an offer or news item always opens its detail first, where it can be stopped; so does a message from Effy
 * (112), whose words and picture are the point; and so does an item that leads nowhere.
 */
export function readsInPlace(item: InboxItemDTO): boolean {
  return !destinationOf(item) || isMarketing(item.category) || isMessage(item.type)
}

export interface OpenDeps {
  push: (path: string) => void
  /** The inbox's own reader. Without one (the arrival toast), an item read in place opens the inbox instead. */
  showDetail?: (item: InboxItemDTO) => void
  markRead?: (id: string) => void
}

/**
 * Opening a notification, the one way (120 R8): from the inbox and from the toast that says it arrived. Records the
 * read and goes where it leads, or shows it in place.
 */
export function openInboxItem(item: InboxItemDTO, deps: OpenDeps): void {
  const inPlace = readsInPlace(item)
  if (inPlace && !deps.showDetail) return deps.push(INBOX_PATH)
  deps.markRead?.(item.id)
  capture({ name: "inbox_item_opened", props: { type: item.type, category: item.category, fallback: destinationOf(item) ? "false" : "true" } })
  void fetch(`/api/notifications/${encodeURIComponent(item.id)}/read`, { method: "POST" }).catch(() => undefined)
  const destination = destinationOf(item)
  if (!inPlace && destination) deps.push(customerWebPathFor(destination))
  else deps.showDetail?.(item)
}
