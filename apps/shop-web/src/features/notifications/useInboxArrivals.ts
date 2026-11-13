import { useEffect, useRef } from "react"

import { useQueryClient } from "@tanstack/react-query"
import { useRouter, useRouterState } from "@tanstack/react-router"

import { inboxArrivals, inboxArrivalTitle, shopPathFor } from "@effy/shared-types"
import { toast } from "@effy/design-system/ui"

import { track } from "@/lib/telemetry"

import { fetchNewest, useUnseenCount } from "./inbox-api"
import { destinationOf, INBOX_PATH, openInboxItem, readsInPlace } from "./openInboxItem"

/** New orders have their own banner, which stays until someone opens the order (120 FR-031). */
const NOT_ANNOUNCED = ["shop_new_order"]

/**
 * A toast when a notification arrives while the console is open (120 US5). Driven by the bell's unseen count - the same
 * query, re-read when the platform says the inbox changed, never on a timer. When the count rises it reads the newest
 * few and says what is new; on the Notifications page, or on the page an item is about, it says nothing.
 */
export function useInboxArrivals(): void {
  const count = useUnseenCount().data
  const qc = useQueryClient()
  const router = useRouter()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const here = useRef(pathname)
  here.current = pathname
  const since = useRef<string | null>(null)
  const lastCount = useRef<number | null>(null)
  // One look at a time, each from the mark the last one left - so two quick changes never lose an arrival.
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    if (count === undefined) return
    const before = lastCount.current
    lastCount.current = count
    // The first read only sets the mark; after it, read again only when the count has gone up.
    if (before !== null && count <= before) return
    queue.current = queue.current
      .then(() => fetchNewest())
      .then((page) => {
        const { arrived, newest } = inboxArrivals(page, since.current, {
          exclude: NOT_ANNOUNCED,
          isHere: (item) => {
            const d = destinationOf(item)
            return !readsInPlace(item) && d !== null && shopPathFor(d) === here.current
          },
        })
        since.current = newest
        if (arrived.length === 0 || here.current === INBOX_PATH) return
        const one = arrived.length === 1 ? arrived[0]! : null
        const type = one ? one.type : "several"
        track({ name: "notif_arrival_shown", count: arrived.length, type })
        toast.info(inboxArrivalTitle(arrived), {
          id: "inbox-arrival",
          action: {
            label: "Open",
            onClick: () => {
              track({ name: "notif_arrival_opened", type })
              const push = (path: string) => router.history.push(path)
              if (one) openInboxItem(one, { qc, push })
              else push(INBOX_PATH)
            },
          },
        })
      })
      .catch(() => undefined)
  }, [count, qc, router])
}
