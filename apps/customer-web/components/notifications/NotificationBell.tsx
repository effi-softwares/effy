"use client"

import { Bell } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import type { InboxCountDTO, LiveDescriptor } from "@effy/shared-types"
// `/live`, never the package root (the root imports the auth SDK, which is barred from this app's client bundles).
import { createCoalescer, createLiveClient } from "@effy/web-kit/live"

/**
 * The bell in the header for a signed-in customer (110 US6): the unseen count, linking to their notifications.
 *
 * Rendered only inside the streamed user island, so a guest's page carries none of this. It starts from the count
 * the server read and re-reads when the platform says the inbox changed (the live word "inbox", and once on coming
 * back to the tab) - never on a timer.
 */
export function NotificationBell({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount)
  useEffect(() => setCount(initialCount), [initialCount])

  useEffect(() => {
    let token: string | null = null
    const read = createCoalescer(async () => {
      const res = await fetch("/api/notifications/unseen-count", { cache: "no-store" }).catch(() => null)
      if (res?.ok) setCount(((await res.json()) as InboxCountDTO).unseenCount)
    })
    const client = createLiveClient({
      async loadDescriptor(): Promise<LiveDescriptor | null> {
        const res = await fetch("/api/live", { cache: "no-store" })
        if (res.status === 204) return null
        if (!res.ok) throw new Error("live: could not find the channel")
        const body = (await res.json()) as { descriptor: LiveDescriptor; token: string }
        token = body.token
        return body.descriptor
      },
      getToken: async () => token,
      onUpdate: (kind) => {
        if (kind === "inbox") read.trigger()
      },
      onCaughtUp: () => read.trigger(),
      onState: () => undefined,
    })
    client.start()
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      if (client.state() === "off") client.start()
      else client.retryNow()
      read.trigger()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      read.cancel()
      client.stop()
    }
  }, [])

  return (
    <Link
      href="/account/notifications"
      prefetch={false}
      className="relative inline-flex size-11 items-center justify-center rounded-md text-foreground hover:bg-muted"
      aria-label={count > 0 ? `Notifications, ${count} new` : "Notifications"}
      data-testid="notifications-bell"
    >
      <Bell aria-hidden="true" className="size-5" />
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="bg-primary-fill text-primary-foreground absolute top-1 right-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-semibold"
        >
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  )
}
