"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import type { LiveDescriptor } from "@effy/shared-types"
// ⚠ `/live`, NEVER the package root: the root imports the auth SDK, which is barred from this app's
// client bundles. This entry point is the channel client and the coalescer, and nothing else.
import { createCoalescer, createLiveClient, type LiveState } from "@effy/web-kit/live"

/**
 * Keeps a signed-in customer's order page current without a timer (071 US4).
 *
 * A client island on a server-rendered page, like `CancelOrder` beside it. When the platform says
 * this customer's orders changed, it asks the server to render the page again (`router.refresh()`)
 * — the same re-read `CancelOrder` already does after a tap. It holds no order data and patches
 * nothing: the page is whatever the server says it is.
 *
 * ⚠ IT IS TOLD ONLY WHEN THE PAGE WOULD CHANGE (FR-025), and never which shop, or how many, is
 * behind the order (FR-024) — the update is the single word "orders".
 *
 * It renders nothing while live. If the channel cannot be held it says so quietly and offers a
 * refresh (FR-015); the page itself is always the last thing the server rendered.
 *
 * Mounted ONLY on the order list and order detail — signed-out pages and the storefront load none
 * of this.
 */
export function LiveRefresh() {
  const router = useRouter()
  const [state, setState] = useState<LiveState>("live")
  // ⚠ Not `useState(() => Date.now())`: this page is prerendered, and reading the clock while
  // rendering a client component fails the production build. Set when the component mounts.
  const [since, setSince] = useState<number | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    setSince(Date.now())
    // The token is fetched with the descriptor and handed to the client from the same answer, so
    // the two always belong to the same session.
    let token: string | null = null
    const refresh = createCoalescer(() => router.refresh())

    const client = createLiveClient({
      async loadDescriptor(): Promise<LiveDescriptor | null> {
        const res = await fetch("/api/live", { cache: "no-store" })
        if (res.status === 204) {
          token = null
          return null
        }
        if (!res.ok) throw new Error("live: could not find the channel")
        const body = (await res.json()) as { descriptor: LiveDescriptor; token: string }
        token = body.token
        return body.descriptor
      },
      getToken: async () => token,
      onUpdate: () => refresh.trigger(),
      onCaughtUp: () => refresh.trigger(),
      onState: (next) => {
        setState((previous) => {
          if (previous === "live" && next !== "live") setSince(Date.now())
          return next
        })
      },
    })
    client.start()

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return
      // Back on the page: whatever happened while away is unknown, so read once and reconnect.
      if (client.state() === "off") client.start()
      else client.retryNow()
      refresh.trigger()
    }
    const onOnline = () => client.retryNow()
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("online", onOnline)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("online", onOnline)
      refresh.cancel()
      client.stop()
    }
  }, [router])

  // Every page load passes through "reconnecting" for a moment; only say so if it lasts.
  useEffect(() => {
    if (state !== "reconnecting") {
      setShown(false)
      return
    }
    const timer = setTimeout(() => setShown(true), 4_000)
    return () => clearTimeout(timer)
  }, [state])

  // `off` is silent here, unlike the consoles: a customer page that does not update by itself is
  // what every page on the web does, and "live updates off" would only alarm them.
  if (state !== "reconnecting" || !shown || since === null) return null

  return (
    <p role="status" className="text-muted-foreground mb-4 flex items-center gap-2 text-sm">
      <span>
        Reconnecting — this page was last updated at{" "}
        {new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(since)}.
      </span>
      <button type="button" className="text-primary underline underline-offset-2" onClick={() => router.refresh()}>
        Refresh
      </button>
    </p>
  )
}
