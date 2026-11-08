import { useEffect, useState } from "react"

import { CheckCheck } from "lucide-react"

import { INBOX_CATEGORIES } from "@effy/shared-types"
import { Button, ToggleGroup, ToggleGroupItem } from "@effy/design-system/ui"
import { PageHeader } from "@effy/web-kit/patterns"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

import { track } from "@/lib/telemetry"

import { InboxList } from "./InboxList"
import { flatten, newestShown, useInboxPages, useMarkAllRead, useMarkSeen, type ShopInboxCategory } from "./inbox-api"

export const SHOP_INBOX_CATEGORIES: readonly ShopInboxCategory[] = ["orders", "stock", "products", "announcements", "important"]

export interface NotificationsSearch {
  filter: "all" | "unread"
  category?: ShopInboxCategory
}

/** The page's filters live in the address (the URL is a list's state): a reload or a shared link shows the same list. */
export function validateNotificationsSearch(raw: Record<string, unknown>): NotificationsSearch {
  const filter = raw.filter === "unread" ? "unread" : "all"
  const category = SHOP_INBOX_CATEGORIES.find((c) => c === raw.category)
  return category ? { filter, category } : { filter }
}

/**
 * Notifications (110 US2): every notification for this operator in the last 90 days, newest first, important ones
 * pinned. All / Unread and a category; mark all read; archive with Undo. Opening it clears the bell.
 */
export function NotificationsScreen({
  search,
  onSearchChange,
}: {
  search: NotificationsSearch
  onSearchChange: (next: NotificationsSearch) => void
}) {
  const pages = useInboxPages({ filter: search.filter, category: search.category })
  useTourPage("notifications", { status: tourStatus(pages) })
  const { pinned, items } = flatten(pages.data)
  const seen = useMarkSeen()
  const readAll = useMarkAllRead()
  const newest = newestShown(pinned, items)
  const anyUnread = [...pinned, ...items].some((i) => !i.readAt)

  const [marked, setMarked] = useState(false)
  useEffect(() => {
    if (marked || !pages.isSuccess) return
    setMarked(true)
    track({ name: "notif_inbox_opened", surface: "page" })
    if (newest) seen.mutate(newest)
  }, [marked, pages.isSuccess, newest, seen])

  const value = search.category ?? search.filter
  const filtered = search.filter !== "all" || search.category !== undefined

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Everything Effy told you in the last 90 days, including ones you closed or missed."
        actions={
          anyUnread && newest ? (
            <Button
              variant="outline"
              data-tour="notifications.mark-all"
              onClick={() => {
                readAll.mutate(newest)
                track({ name: "notif_inbox_all_read" })
              }}
            >
              <CheckCheck aria-hidden="true" />
              Mark all read
            </Button>
          ) : null
        }
      />
      <div data-tour="notifications.filters" className="overflow-x-auto">
        <ToggleGroup
          type="single"
          variant="outline"
          value={value}
          onValueChange={(v) => {
            if (!v) return
            if (v === "all" || v === "unread") onSearchChange({ filter: v })
            else onSearchChange({ filter: "all", category: v as ShopInboxCategory })
          }}
          aria-label="Show"
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="unread">Unread</ToggleGroupItem>
          {SHOP_INBOX_CATEGORIES.map((c) => (
            <ToggleGroupItem key={c} value={c}>
              {INBOX_CATEGORIES[c].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <InboxList
        pinned={pinned}
        items={items}
        loading={pages.isPending}
        hasMore={pages.hasNextPage}
        loadingMore={pages.isFetchingNextPage}
        onLoadMore={() => void pages.fetchNextPage()}
        emptyTitle={filtered ? "Nothing here" : undefined}
        emptyBody={filtered ? "No notifications match this filter." : undefined}
      />
    </div>
  )
}
