import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query"

import type {
  InboxArchiveDTO,
  InboxCountDTO,
  InboxFilter,
  InboxItemDTO,
  InboxPageDTO,
  InboxReadAllDTO,
} from "@effy/shared-types"

import { api } from "@/lib/api"

/**
 * The operator's own notification inbox (110), over the shop service's five inbox routes. Everything lives under
 * `["shop","inbox"]`, which the live kind `inbox` invalidates (features/live/routes.ts) - nothing re-reads on a timer.
 */
export const INBOX_ROOT = ["shop", "inbox"] as const

export type ShopInboxCategory = "orders" | "stock" | "products" | "announcements" | "important"

export interface InboxView {
  filter: InboxFilter
  category?: ShopInboxCategory
  /** 20 for the side panel, 30 for the page. */
  limit?: number
}

function pagePath(view: InboxView, cursor: string | null): string {
  const q = new URLSearchParams()
  if (view.filter !== "all") q.set("filter", view.filter)
  if (view.category) q.set("category", view.category)
  if (view.limit) q.set("limit", String(view.limit))
  if (cursor) q.set("cursor", cursor)
  const s = q.toString()
  return `/shop/v1/notifications${s ? `?${s}` : ""}`
}

export function useInboxPages(view: InboxView, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...INBOX_ROOT, "pages", view],
    queryFn: ({ pageParam }) => api.get<InboxPageDTO>(pagePath(view, pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  })
}

/** The newest few, for the arrival toast (120): read only when the unseen count rises. */
export function fetchNewest(limit = 5): Promise<InboxPageDTO> {
  return api.get<InboxPageDTO>(pagePath({ filter: "all", limit }, null))
}

export function useUnseenCount() {
  return useQuery({
    queryKey: [...INBOX_ROOT, "unseen"],
    queryFn: () => api.get<InboxCountDTO>("/shop/v1/notifications/unseen-count"),
    select: (d) => d.unseenCount,
  })
}

/** The pinned items and every loaded item, in order, from the pages read so far. */
export function flatten(data: InfiniteData<InboxPageDTO> | undefined): { pinned: InboxItemDTO[]; items: InboxItemDTO[] } {
  const pages = data?.pages ?? []
  const seen = new Set<string>()
  const items: InboxItemDTO[] = []
  for (const p of pages) for (const i of p.items) if (!seen.has(i.id)) { seen.add(i.id); items.push(i) }
  return { pinned: pages[0]?.pinned ?? [], items }
}

/** The newest createdAt shown (microseconds kept), the cut-off for "seen" and "mark all read". */
export function newestShown(pinned: readonly InboxItemDTO[], items: readonly InboxItemDTO[]): string | null {
  let newest: string | null = null
  for (const i of [...pinned, ...items]) if (!newest || i.createdAt > newest) newest = i.createdAt
  return newest
}

function setUnseen(qc: ReturnType<typeof useQueryClient>, n: number) {
  qc.setQueryData<InboxCountDTO>([...INBOX_ROOT, "unseen"], { unseenCount: n })
}

/** Opening the inbox: everything up to the newest shown is seen, so the bell clears. */
export function useMarkSeen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (before: string) => api.post<InboxCountDTO>("/shop/v1/notifications/seen", { before }),
    onSuccess: (d) => setUnseen(qc, d.unseenCount),
  })
}

/** Every loaded page, with `fn` applied to each item. */
function patchItems(qc: ReturnType<typeof useQueryClient>, fn: (i: InboxItemDTO) => InboxItemDTO | null) {
  qc.setQueriesData<InfiniteData<InboxPageDTO>>({ queryKey: [...INBOX_ROOT, "pages"] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            pinned: p.pinned.map(fn).filter((i): i is InboxItemDTO => i !== null),
            items: p.items.map(fn).filter((i): i is InboxItemDTO => i !== null),
          })),
        }
      : data,
  )
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (before: string) => api.post<InboxReadAllDTO>("/shop/v1/notifications/read-all", { before }),
    onMutate: (before) => {
      const at = new Date().toISOString()
      patchItems(qc, (i) => (i.createdAt <= before && !i.readAt ? { ...i, readAt: at } : i))
    },
    onSuccess: (d) => setUnseen(qc, d.unseenCount),
    onSettled: () => void qc.invalidateQueries({ queryKey: INBOX_ROOT }),
  })
}

/** Shown as read straight away; the read itself is 109's route (markNotificationRead), called by the row. */
export function markLocallyRead(qc: ReturnType<typeof useQueryClient>, id: string) {
  const at = new Date().toISOString()
  patchItems(qc, (i) => (i.id === id && !i.readAt ? { ...i, readAt: at } : i))
}

/** Archive or undo. Archive takes the row off at once; a 404 (already gone) counts as done. */
export function useSetArchived() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      api.patch<InboxArchiveDTO>(`/shop/v1/notifications/${encodeURIComponent(id)}`, { archived }),
    onMutate: ({ id, archived }) => {
      if (archived) patchItems(qc, (i) => (i.id === id ? null : i))
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: INBOX_ROOT }),
  })
}
