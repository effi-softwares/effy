import { useEffect, useState } from "react"

import { Link } from "@tanstack/react-router"
import { Bell, CheckCheck, XIcon } from "lucide-react"

import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerTitle,
} from "@effy/design-system/ui"
import { useIsMobile } from "@effy/design-system/hooks/use-mobile"

import { track } from "@/lib/telemetry"

import { InboxList } from "./InboxList"
import { flatten, newestShown, useInboxPages, useMarkAllRead, useMarkSeen, useUnseenCount } from "./inbox-api"

/** The installed console's icon shows the count where the browser supports it (110 R8); nothing otherwise. */
function useAppBadge(count: number | undefined) {
  useEffect(() => {
    if (count === undefined) return
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (count > 0) void nav.setAppBadge?.(count).catch(() => undefined)
    else void nav.clearAppBadge?.().catch(() => undefined)
  }, [count])
}

/**
 * The bell in the console header (110 US2): the operator's unseen count, opening a side panel with their latest 20
 * notifications. Opening it clears the count; "See all" goes to the Notifications page. Live through the kind `inbox`.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const unseen = useUnseenCount()
  useAppBadge(unseen.data)
  const count = unseen.data ?? 0

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} className="relative">
        <Bell aria-hidden="true" />
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-accent2 px-1 text-[10px] leading-4 font-semibold text-white"
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
        <span className="sr-only">{count > 0 ? `Notifications, ${count} new` : "Notifications"}</span>
      </Button>
      <Drawer open={open} onOpenChange={setOpen} direction={isMobile ? "bottom" : "right"}>
        <DrawerContent
          aria-label="Notifications"
          className={isMobile ? "data-[vaul-drawer-direction=bottom]:max-h-[92dvh]" : "data-[vaul-drawer-direction=right]:sm:max-w-md"}
        >
          {isMobile ? <DrawerHandle /> : null}
          {open ? <InboxPanel onClose={() => setOpen(false)} isMobile={isMobile} /> : null}
        </DrawerContent>
      </Drawer>
    </>
  )
}

function InboxPanel({ onClose, isMobile }: { onClose: () => void; isMobile: boolean }) {
  const pages = useInboxPages({ filter: "all", limit: 20 })
  const { pinned, items } = flatten(pages.data)
  const seen = useMarkSeen()
  const readAll = useMarkAllRead()
  const newest = newestShown(pinned, items)
  const anyUnread = [...pinned, ...items].some((i) => !i.readAt)

  // Opening the panel is opening the inbox: everything shown is seen, once per opening.
  const [marked, setMarked] = useState(false)
  useEffect(() => {
    if (marked || !pages.isSuccess) return
    setMarked(true)
    track({ name: "notif_inbox_opened", surface: "panel" })
    if (newest) seen.mutate(newest)
  }, [marked, pages.isSuccess, newest, seen])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={isMobile ? "flex items-start gap-3 px-4 pt-3 pb-2" : "flex items-start gap-3 px-5 pt-4 pb-3"}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <DrawerTitle className="flex items-center gap-2">
            <Bell aria-hidden="true" className="size-4 text-muted-foreground" />
            Notifications
          </DrawerTitle>
          <DrawerDescription className="sr-only">Your latest notifications</DrawerDescription>
        </div>
        {anyUnread && newest ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              readAll.mutate(newest)
              track({ name: "notif_inbox_all_read" })
            }}
          >
            <CheckCheck aria-hidden="true" />
            Mark all read
          </Button>
        ) : null}
        {isMobile ? null : (
          <DrawerClose asChild>
            <Button variant="ghost" size="icon-sm" className="-mr-1 text-muted-foreground">
              <XIcon aria-hidden="true" />
              <span className="sr-only">Close</span>
            </Button>
          </DrawerClose>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <InboxList pinned={pinned} items={items} loading={pages.isPending} hasMore={false} loadingMore={false} onOpened={onClose} />
      </div>
      <div className="border-t px-5 py-3">
        <Link to="/notifications" search={{ filter: "all" }} onClick={onClose} className="text-sm font-medium">
          See all notifications
        </Link>
      </div>
    </div>
  )
}
