"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

/**
 * A toast when a notification arrives while the customer is on the website (120 US5). Driven by the bell's own count,
 * which re-reads when the platform says the inbox changed - never on a timer. When the count rises it looks at the
 * inbox's first page and says what is new; on the inbox page, or on the page an item is about, it says nothing.
 *
 * The looking (`arrivals.ts`) is fetched on demand: the bell is in every page's header, so anything imported here is on
 * every guest page's first load.
 */
export function useInboxArrivals(count: number): void {
  const router = useRouter()
  const pathname = usePathname()
  const here = useRef(pathname)
  here.current = pathname
  const since = useRef<string | null>(null)
  const lastCount = useRef<number | null>(null)
  // One look at a time, each from the mark the last one left - so two quick changes never lose an arrival.
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    const before = lastCount.current
    lastCount.current = count
    // The first look only sets the mark; after it, look again only when the count has gone up.
    if (before !== null && count <= before) return
    queue.current = queue.current
      .then(() => import("./arrivals"))
      .then((m) => m.lookForArrivals({ since: since.current, here: () => here.current, push: (path) => router.push(path) }))
      .then((newest) => {
        since.current = newest
      })
      .catch(() => undefined)
  }, [count, router])
}
