import { customerWebPathFor, inboxArrivals, inboxArrivalTitle, type InboxPageDTO } from "@effy/shared-types"
import { toast } from "@effy/design-system/toast"

import { capture } from "@/lib/telemetry"

import { destinationOf, INBOX_PATH, openInboxItem, readsInPlace } from "./openInboxItem"

/**
 * One look at what arrived (120 US5): reads the inbox's first page, says what is new since `since`, and returns the new
 * mark. Loaded by `useInboxArrivals` the first time the bell's count is known, so a guest page carries none of it.
 */
export async function lookForArrivals(opts: {
  since: string | null
  here: () => string
  push: (path: string) => void
}): Promise<string | null> {
  const res = await fetch("/api/notifications?limit=5", { cache: "no-store" }).catch(() => null)
  if (!res?.ok) return opts.since
  const page = (await res.json()) as InboxPageDTO
  const { arrived, newest } = inboxArrivals(page, opts.since, {
    isHere: (item) => {
      const d = destinationOf(item)
      return !readsInPlace(item) && d !== null && customerWebPathFor(d) === opts.here()
    },
  })
  if (arrived.length === 0 || opts.here().startsWith(INBOX_PATH)) return newest
  const one = arrived.length === 1 ? arrived[0]! : null
  const type = one ? one.type : "several"
  capture({ name: "notif_arrival_shown", props: { count: arrived.length, type } })
  toast.info(inboxArrivalTitle(arrived), {
    id: "inbox-arrival",
    action: {
      label: "Open",
      onClick: () => {
        capture({ name: "notif_arrival_opened", props: { type } })
        if (one) openInboxItem(one, { push: opts.push })
        else opts.push(INBOX_PATH)
      },
    },
  })
  return newest
}
