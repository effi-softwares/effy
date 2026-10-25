import type { ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

import type { OrdersSearch } from "../orderConsole"
import { orderListQuery } from "../queries"

export function OrderPager({
  fulfillmentId,
  search,
  onNavigate,
}: {
  fulfillmentId: string
  search: OrdersSearch
  onNavigate: (fulfillmentId: string, search: OrdersSearch) => void
}) {
  const list = useQuery(orderListQuery(search))
  const rows = list.data?.items ?? []
  const index = rows.findIndex((r) => r.id === fulfillmentId)
  const page = list.data?.page ?? 1
  const pageSize = list.data?.pageSize ?? 25
  const total = list.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const needPrev = index === 0 && page > 1
  const needNext = index >= 0 && index === rows.length - 1 && page < pageCount
  const prevPage = useQuery({ ...orderListQuery({ ...search, page: page - 1 }), enabled: needPrev })
  const nextPage = useQuery({ ...orderListQuery({ ...search, page: page + 1 }), enabled: needNext })

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
      <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums max-md:hidden">
        {(page - 1) * pageSize + index + 1} of {total}
      </span>
      <PagerButton label="Previous order" target={prev} onNavigate={onNavigate}>
        <ChevronLeft aria-hidden="true" className="size-5" />
      </PagerButton>
      <PagerButton label="Next order" target={next} onNavigate={onNavigate}>
        <ChevronRight aria-hidden="true" className="size-5" />
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
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!target}
      onClick={() => target && onNavigate(target.id, target.search)}
      className={cn(
        "grid size-11 place-items-center rounded-lg border border-input bg-background p-0 shadow-xs",
        target ? "text-foreground hover:bg-accent cursor-pointer" : "text-muted-foreground cursor-default",
      )}
    >
      {children}
    </button>
  )
}
