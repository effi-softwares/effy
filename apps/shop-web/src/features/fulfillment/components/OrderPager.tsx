import { useQuery } from "@tanstack/react-query"

import { cn } from "@/lib/utils"

import type { OrdersSearch } from "../orderConsole"
import { orderListQuery } from "../queries"

/**
 * The order pagination in the APP HEADER (057 A3 revision 2) — "{n} of {total}", then previous and
 * next. It renders on order detail only, and nowhere in the page body.
 *
 * ⚠ IT READS THE LIST'S OWN CACHED QUERY (same key, same filters), so "3 of 47" is the list the
 * operator came from. At a page edge it reads the neighbouring page the same way. At the ends of the
 * list the arrows are muted and inert. Opened with no list behind it (a dashboard link) and not on the
 * first page, it renders nothing rather than a position it cannot know.
 */
export function OrderPager({
  fulfillmentId,
  search,
  onNavigate,
}: {
  fulfillmentId: string
  search: OrdersSearch
  onNavigate: (fulfillmentId: string, search: OrdersSearch) => void
}) {
  const list = useQuery({ ...orderListQuery(search), refetchInterval: false })
  const rows = list.data?.items ?? []
  const index = rows.findIndex((r) => r.id === fulfillmentId)
  const page = list.data?.page ?? 1
  const pageSize = list.data?.pageSize ?? 25
  const total = list.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const needPrev = index === 0 && page > 1
  const needNext = index >= 0 && index === rows.length - 1 && page < pageCount
  const prevPage = useQuery({ ...orderListQuery({ ...search, page: page - 1 }), refetchInterval: false, enabled: needPrev })
  const nextPage = useQuery({ ...orderListQuery({ ...search, page: page + 1 }), refetchInterval: false, enabled: needNext })

  if (index < 0) return null

  const prev =
    index > 0
      ? { id: rows[index - 1]!.id, search }
      : needPrev && prevPage.data?.items.length
        ? { id: prevPage.data.items[prevPage.data.items.length - 1]!.id, search: { ...search, page: page - 1 } }
        : null
  const next =
    index < rows.length - 1
      ? { id: rows[index + 1]!.id, search }
      : needNext && nextPage.data?.items.length
        ? { id: nextPage.data.items[0]!.id, search: { ...search, page: page + 1 } }
        : null

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="text-muted-foreground text-[12.5px] whitespace-nowrap tabular-nums">
        {(page - 1) * pageSize + index + 1} of {total}
      </span>
      <PagerButton label="Previous order" target={prev} onNavigate={onNavigate}>
        ←
      </PagerButton>
      <PagerButton label="Next order" target={next} onNavigate={onNavigate}>
        →
      </PagerButton>
    </div>
  )
}

function PagerButton({
  label,
  target,
  onNavigate,
  children,
}: {
  label: string
  target: { id: string; search: OrdersSearch } | null
  onNavigate: (fulfillmentId: string, search: OrdersSearch) => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!target}
      onClick={() => target && onNavigate(target.id, target.search)}
      className={cn(
        "border-input bg-background grid size-7 place-items-center rounded-md border p-0 text-[12px]",
        target ? "text-foreground hover:bg-accent cursor-pointer" : "text-muted-foreground cursor-default",
      )}
    >
      {children}
    </button>
  )
}
