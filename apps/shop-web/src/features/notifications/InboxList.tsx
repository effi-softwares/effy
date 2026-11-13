import { useEffect, useRef, useState } from "react"

import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import {
  Archive,
  Bell,
  Boxes,
  CircleAlert,
  Coins,
  Megaphone,
  MessageCircle,
  Newspaper,
  Package,
  ShoppingBasket,
  Tag,
  Truck,
  type LucideIcon,
} from "lucide-react"

import {
  groupInboxByDay,
  INBOX_CATEGORIES,
  inboxTimeLabel,
  isInboxCategory,
  parseDestination,
  shopPathFor,
  type InboxItemDTO,
  type ShopDestination,
} from "@effy/shared-types"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from "@effy/design-system/ui"
import { ListSkeleton, Loading } from "@effy/web-kit/patterns"

import { cn } from "@/lib/utils"
import { track } from "@/lib/telemetry"

import { useSetArchived } from "./inbox-api"
import { openInboxItem } from "./openInboxItem"

const ICONS: Record<string, LucideIcon> = {
  package: Package,
  coins: Coins,
  truck: Truck,
  boxes: Boxes,
  "shopping-basket": ShoppingBasket,
  tag: Tag,
  newspaper: Newspaper,
  "circle-alert": CircleAlert,
  "message-circle": MessageCircle,
  megaphone: Megaphone,
}

export function categoryIcon(category: string): LucideIcon {
  return isInboxCategory(category) ? (ICONS[INBOX_CATEGORIES[category].icon] ?? Bell) : Bell
}

/**
 * The operator's notifications as a feed (110 US2): the pinned important ones first, then Today / Yesterday / Earlier
 * on Effy's clock. A click records the read and opens what it is about; archive takes it off with Undo. Shared by the
 * header's side panel and the Notifications page. A feed, not a list of records - so not a DataTable
 * (list-screens.guard names it).
 */
export function InboxList({
  pinned,
  items,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpened,
  emptyTitle = "You're all caught up",
  emptyBody = "New orders, stock warnings and news from Effy appear here.",
}: {
  pinned: InboxItemDTO[]
  items: InboxItemDTO[]
  loading: boolean
  hasMore: boolean
  loadingMore: boolean
  onLoadMore?: () => void
  /** After a click has opened its page (the panel closes itself). */
  onOpened?: () => void
  emptyTitle?: string
  emptyBody?: string
}) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = end.current
    if (!node || !onLoadMore || !hasMore) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onLoadMore()
    })
    io.observe(node)
    return () => io.disconnect()
  }, [hasMore, onLoadMore, items.length])

  if (loading) {
    return (
      <Loading label="Reading your notifications">
        <ListSkeleton rows={6} media="icon" lines={2} trailing="text" />
      </Loading>
    )
  }
  if (pinned.length === 0 && items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <Bell aria-hidden="true" className="size-6 text-muted-foreground" />
        <p className="font-medium">{emptyTitle}</p>
        <p className="max-w-[36ch] text-sm text-muted-foreground">{emptyBody}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col" data-tour="notifications.list">
      {pinned.length > 0 ? (
        <section aria-label="Important">
          <h3 className="px-1 pt-2 pb-1 text-sm font-medium text-muted-foreground">Important</h3>
          <ul className="flex flex-col divide-y">{pinned.map((i) => <InboxRow key={i.id} item={i} onOpened={onOpened} />)}</ul>
        </section>
      ) : null}
      {groupInboxByDay(items).map((g) => (
        <section key={g.heading} aria-label={g.heading}>
          <h3 className="px-1 pt-4 pb-1 text-sm font-medium text-muted-foreground">{g.heading}</h3>
          <ul className="flex flex-col divide-y">{g.items.map((i) => <InboxRow key={i.id} item={i} onOpened={onOpened} />)}</ul>
        </section>
      ))}
      <div ref={end} />
      {loadingMore ? <ListSkeleton rows={2} media="icon" lines={2} /> : null}
      {!hasMore && !loadingMore && onLoadMore ? (
        <p className="py-6 text-center text-sm text-muted-foreground">That's everything from the last 90 days.</p>
      ) : null}
    </div>
  )
}

function InboxRow({ item, onOpened }: { item: InboxItemDTO; onOpened?: () => void }) {
  const router = useRouter()
  const qc = useQueryClient()
  const archive = useSetArchived()
  const Icon = categoryIcon(item.category)
  const unread = !item.readAt
  const time = inboxTimeLabel(item.createdAt)

  const [reading, setReading] = useState(false)
  const destination = parseDestination("shop", item.destination) as ShopDestination | null

  const go = () => {
    router.history.push(shopPathFor(destination))
    onOpened?.()
  }

  const open = () =>
    openInboxItem(item, {
      qc,
      push: (path) => {
        router.history.push(path)
        onOpened?.()
      },
      readInPlace: () => setReading(true),
    })

  const remove = () => {
    archive.mutate({ id: item.id, archived: true })
    track({ name: "notif_inbox_archived", type: item.type, category: item.category })
    toast("Notification archived", {
      action: {
        label: "Undo",
        onClick: () => {
          archive.mutate({ id: item.id, archived: false })
          track({ name: "notif_inbox_undo", type: item.type, category: item.category })
        },
      },
      duration: 5000,
    })
  }

  return (
    <li className="group flex items-start gap-1">
      <button
        type="button"
        onClick={open}
        className="flex min-h-14 min-w-0 flex-1 items-start gap-3 rounded-md px-1 py-3 text-left hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("truncate", unread ? "font-semibold" : "font-normal")}>
            {unread ? <span className="sr-only">Unread: </span> : null}
            {item.title}
          </span>
          <span className="line-clamp-2 text-sm text-muted-foreground">{item.body}</span>
          <span className="text-xs text-muted-foreground">
            {time}
            {item.endsLabel ? ` · ${item.endsLabel}` : ""}
          </span>
        </span>
        <span aria-hidden="true" className={cn("mt-2 size-2 shrink-0 rounded-full", unread ? "bg-accent2" : "bg-transparent")} />
      </button>
      <Button
        variant="ghost"
        size="icon"
        onClick={remove}
        className="mt-1 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Archive aria-hidden="true" />
        <span className="sr-only">Archive “{item.title}”</span>
      </Button>
      {item.type === "shop_message" ? (
        <MessageDetail
          item={item}
          open={reading}
          onOpenChange={setReading}
          onGo={() => {
            setReading(false)
            go()
          }}
        />
      ) : null}
    </li>
  )
}

/** A message from Effy, opened (112 FR-033): the picture, the words, and where it leads. */
function MessageDetail({
  item,
  open,
  onOpenChange,
  onGo,
}: {
  item: InboxItemDTO
  open: boolean
  onOpenChange: (open: boolean) => void
  onGo: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.title}</DialogTitle>
          <DialogDescription>From Effy · {inboxTimeLabel(item.createdAt)}</DialogDescription>
        </DialogHeader>
        {item.imageUrl ? <img src={item.imageUrl} alt="" className="aspect-video w-full rounded-md border object-cover" /> : null}
        <p className="whitespace-pre-line text-sm">{item.body}</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={onGo}>
            Open
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
