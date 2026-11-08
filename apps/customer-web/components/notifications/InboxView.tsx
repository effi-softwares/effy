"use client"

import clsx from "clsx"
import { Archive, Bell, CircleAlert, Coins, MessageCircle, Newspaper, Package, Tag, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import {
  customerWebPathFor,
  groupInboxByDay,
  INBOX_CATEGORIES,
  inboxTimeLabel,
  isInboxCategory,
  parseDestination,
  type CustomerDestination,
  type InboxItemDTO,
  type InboxPageDTO,
} from "@effy/shared-types"

import { MARKETING_CONSENT } from "@effy/legal-content/consent"

import { btnClass } from "@/components/storefront/actions"
import { Dialog } from "@/components/ui/dialog"
import { RowsSkeleton } from "@/components/ui/skeletons"
import { capture } from "@/lib/telemetry"
import { toast } from "@/lib/toast-store"

const ICONS: Record<string, LucideIcon> = {
  package: Package,
  coins: Coins,
  tag: Tag,
  newspaper: Newspaper,
  "circle-alert": CircleAlert,
  "message-circle": MessageCircle,
}
const icon = (category: string): LucideIcon =>
  isInboxCategory(category) ? (ICONS[INBOX_CATEGORIES[category].icon] ?? Bell) : Bell

type Filter = "all" | "unread"
type InboxItem = InboxItemDTO

const isMarketing = (category: string) => category === "offers" || category === "news"
const destinationOf = (item: InboxItemDTO) => parseDestination("customer", item.destination) as CustomerDestination | null

/**
 * The customer's notifications on the website (110 US6), at parity with the app except swipe: newest first, important
 * ones pinned, Today / Yesterday / Earlier on Effy's clock, All / Unread and the categories they have items in. A click
 * records the read and opens what it is about; archive takes it off with Undo; mark all read. Opening the page clears
 * the bell. The server renders the first page (and again on a live update); this loads more and acts.
 */
export function InboxView({ initial, filter, category }: { initial: InboxPageDTO | null; filter: Filter; category?: string }) {
  const router = useRouter()
  const [pinned, setPinned] = useState<InboxItemDTO[]>(initial?.pinned ?? [])
  const [items, setItems] = useState<InboxItemDTO[]>(initial?.items ?? [])
  const [cursor, setCursor] = useState<string | null>(initial?.nextCursor ?? null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [detail, setDetail] = useState<InboxItemDTO | null>(null)
  const categories = initial?.categories ?? []

  // A server re-render (a live update, a filter change) replaces what is shown.
  useEffect(() => {
    setPinned(initial?.pinned ?? [])
    setItems(initial?.items ?? [])
    setCursor(initial?.nextCursor ?? null)
  }, [initial])

  const newest = [...pinned, ...items].reduce<string | null>((n, i) => (!n || i.createdAt > n ? i.createdAt : n), null)

  // Opening the page is opening the inbox: everything shown is seen, once.
  const seenOnce = useRef(false)
  useEffect(() => {
    if (seenOnce.current || !initial) return
    seenOnce.current = true
    capture({ name: "inbox_opened", props: { surface: "web" } })
    if (newest) void post("/api/notifications/seen", { before: newest })
  }, [initial, newest])

  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = end.current
    if (!node || !cursor) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore()
    })
    io.observe(node)
    return () => io.disconnect()
  })

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    const q = new URLSearchParams({ cursor })
    if (filter !== "all") q.set("filter", filter)
    if (category) q.set("category", category)
    const res = await fetch(`/api/notifications?${q}`, { cache: "no-store" }).catch(() => null)
    if (res?.ok) {
      const page = (await res.json()) as InboxPageDTO
      setItems((now) => {
        const known = new Set(now.map((i) => i.id))
        return [...now, ...page.items.filter((i) => !known.has(i.id))]
      })
      setCursor(page.nextCursor)
    }
    setLoadingMore(false)
  }

  const markRead = (id: string) => {
    const at = new Date().toISOString()
    const read = (i: InboxItemDTO) => (i.id === id && !i.readAt ? { ...i, readAt: at } : i)
    setPinned((p) => p.map(read))
    setItems((p) => p.map(read))
  }

  function open(item: InboxItemDTO) {
    markRead(item.id)
    const destination = parseDestination("customer", item.destination) as CustomerDestination | null
    capture({ name: "inbox_item_opened", props: { type: item.type, category: item.category, fallback: destination ? "false" : "true" } })
    void post(`/api/notifications/${encodeURIComponent(item.id)}/read`)
    // 111 FR-024: an offer or news item always opens its detail first, where it can be stopped.
    if (destination && !isMarketing(item.category)) router.push(customerWebPathFor(destination))
    else setDetail(item)
  }

  /** "Stop offers like this": a no from the inbox, with Undo (111 US6). */
  async function stopMarketing(item: InboxItem) {
    const category = item.category as "offers" | "news"
    setDetail(null)
    const answer = (granted: boolean) =>
      fetch("/api/notification-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consent: { [category]: granted }, via: "inbox", wordingVersion: MARKETING_CONSENT.version }),
      }).then((r) => r.ok, () => false)
    if (!(await answer(false))) {
      toast("We couldn't change that. Try again in Notification settings.")
      return
    }
    capture({ name: "offers_stopped_from_inbox", props: { category, surface: "web" } })
    toast(category === "news" ? "You won't get news from Effy any more" : "You won't get offers from Effy any more", {
      action: { label: "Undo", run: () => void answer(true) },
    })
  }

  function archive(item: InboxItemDTO) {
    const wasPinned = pinned.some((i) => i.id === item.id)
    const index = (wasPinned ? pinned : items).findIndex((i) => i.id === item.id)
    const drop = (list: InboxItemDTO[]) => list.filter((i) => i.id !== item.id)
    setPinned(drop)
    setItems(drop)
    capture({ name: "inbox_item_archived", props: { type: item.type, category: item.category } })
    void patch(item.id, true)
    toast("Notification archived", {
      action: {
        label: "Undo",
        run: () => {
          const back = (list: InboxItemDTO[]) =>
            list.some((i) => i.id === item.id) ? list : [...list.slice(0, index), item, ...list.slice(index)]
          if (wasPinned) setPinned(back)
          else setItems(back)
          capture({ name: "inbox_archive_undone", props: { type: item.type, category: item.category } })
          void patch(item.id, false)
        },
      },
    })
  }

  function markAllRead() {
    if (!newest) return
    const at = new Date().toISOString()
    const read = (i: InboxItemDTO) => (i.readAt ? i : { ...i, readAt: at })
    setPinned((p) => p.map(read))
    setItems((p) => p.map(read))
    capture({ name: "inbox_marked_all_read" })
    void post("/api/notifications/read-all", { before: newest })
  }

  const anyUnread = [...pinned, ...items].some((i) => !i.readAt)
  const filtered = filter !== "all" || category !== undefined
  const chips = (Object.keys(INBOX_CATEGORIES) as (keyof typeof INBOX_CATEGORIES)[]).filter(
    (c) => INBOX_CATEGORIES[c].filterableBy.includes("customer") && categories.includes(c),
  )

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Notifications</h2>
          <p className="text-sm text-muted-foreground">Everything we've told you about your orders and points in the last 6 months.</p>
        </div>
        <div className="flex items-center gap-4">
          {anyUnread ? (
            <button type="button" onClick={markAllRead} className="text-sm font-medium text-primary underline-offset-2 hover:underline">
              Mark all read
            </button>
          ) : null}
          <Link href="/account/notifications/settings" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
            Settings
          </Link>
        </div>
      </div>

      <nav aria-label="Show" className="flex flex-wrap gap-2">
        <Chip href="/account/notifications" active={!filtered} label="All" />
        <Chip href="/account/notifications?filter=unread" active={filter === "unread"} label="Unread" />
        {chips.map((c) => (
          <Chip key={c} href={`/account/notifications?category=${c}`} active={category === c} label={INBOX_CATEGORIES[c].label} />
        ))}
      </nav>

      {initial === null ? (
        <p className="py-12 text-center text-muted-foreground">We couldn't load your notifications. Refresh the page to try again.</p>
      ) : pinned.length === 0 && items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Bell aria-hidden="true" className="size-6 text-muted-foreground" />
          <p className="font-medium">{filtered ? "Nothing here" : "You're all caught up"}</p>
          <p className="max-w-[40ch] text-sm text-muted-foreground">
            {filtered ? "No notifications match this filter." : "When there's news about an order or your points, we'll tell you here."}
          </p>
          {filtered ? (
            <Link href="/account/notifications" className="text-sm font-medium text-primary">
              Show all
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 ? <Group heading="Important" items={pinned} onOpen={open} onArchive={archive} /> : null}
          {groupInboxByDay(items).map((g) => (
            <Group key={g.heading} heading={g.heading} items={g.items} onOpen={open} onArchive={archive} />
          ))}
          <div ref={end} />
          {loadingMore ? <RowsSkeleton rows={2} media="round" /> : null}
          {!cursor && !loadingMore ? (
            <p className="text-center text-sm text-muted-foreground">That's everything from the last 6 months.</p>
          ) : null}
        </div>
      )}

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)} title={detail?.title ?? ""}>
        <p>{detail?.body}</p>
        {detail?.endsLabel ? <p className="mt-2 text-sm text-muted-foreground">{detail.endsLabel}</p> : null}
        {detail && isMarketing(detail.category) ? (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {destinationOf(detail) ? (
              <button
                type="button"
                className={btnClass("primary", "md")}
                onClick={() => {
                  const d = destinationOf(detail)!
                  setDetail(null)
                  router.push(customerWebPathFor(d))
                }}
              >
                See offer
              </button>
            ) : null}
            <button type="button" onClick={() => void stopMarketing(detail)} className="text-sm font-medium text-primary underline-offset-2 hover:underline">
              {detail.category === "news" ? MARKETING_CONSENT.stopNews : MARKETING_CONSENT.stopOffers}
            </button>
          </div>
        ) : null}
      </Dialog>
    </section>
  )
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium",
        active ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
      )}
    >
      {label}
    </Link>
  )
}

function Group({
  heading,
  items,
  onOpen,
  onArchive,
}: {
  heading: string
  items: InboxItemDTO[]
  onOpen: (i: InboxItemDTO) => void
  onArchive: (i: InboxItemDTO) => void
}) {
  return (
    <section aria-label={heading}>
      <h3 className="mb-1 text-sm font-medium text-muted-foreground">{heading}</h3>
      <ul className="divide-y border-y">
        {items.map((item) => {
          const Icon = icon(item.category)
          const unread = !item.readAt
          return (
            <li key={item.id} className="flex items-start gap-2">
              <button type="button" onClick={() => onOpen(item)} className="flex min-w-0 flex-1 items-start gap-4 py-4 text-left hover:bg-muted/50">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={clsx("truncate", unread ? "font-semibold" : "font-normal")}>
                    {unread ? <span className="sr-only">Unread: </span> : null}
                    {item.title}
                  </span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">{item.body}</span>
                  <span className="text-xs text-muted-foreground">
                    {inboxTimeLabel(item.createdAt)}
                    {item.endsLabel ? ` · ${item.endsLabel}` : ""}
                  </span>
                </span>
                <span aria-hidden="true" className={clsx("mt-2 size-2.5 shrink-0 rounded-full", unread ? "bg-primary-fill" : "bg-transparent")} />
              </button>
              <button
                type="button"
                onClick={() => onArchive(item)}
                className="mt-3 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Archive “${item.title}”`}
              >
                <Archive aria-hidden="true" className="size-4" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

async function post(path: string, body?: unknown): Promise<void> {
  await fetch(path, {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => undefined)
}

async function patch(id: string, archived: boolean): Promise<void> {
  await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ archived }),
  }).catch(() => undefined)
}
