import { useEffect, useRef, type ReactNode } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowRight, ChevronDown, ChevronLeft, X } from "lucide-react"

import { PACKAGE_STATUSES, type PackageStatus } from "@effy/shared-types"
import { useIsMobile } from "@effy/design-system/hooks/use-mobile"
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, TabsCount } from "@effy/design-system/ui"
import { ErrorState, PackageStatusPill } from "@effy/web-kit/console"
import { Bone, boneWidth, Loading, ResponsiveSheet } from "@effy/web-kit/patterns"

import { cn } from "@/lib/utils"

import { timeOf } from "../collection"
import { deliveredByText, formatPlacedShort, type OrderRow, type OrdersSearch } from "../orderConsole"
import { orderListQuery } from "../queries"

const TITLE = "Left the shop"
const NOTE = "On their way, and delivered today."

// Something wrong comes first; the rest in the order a package travels.
const STAGES: readonly PackageStatus[] = ["problem", ...PACKAGE_STATUSES.filter((s) => s !== "problem")]

/** The whole set, not a page of it: the strip's count and its problem dot read the same rows the column shows. */
/** Scrolls the board to its end, where this column sits. */
function reveal(column: HTMLElement | null) {
  const board = column?.parentElement
  board?.scrollTo?.({ left: board.scrollWidth })
}

const useLeftShop = (q: string | undefined) => useQuery(orderListQuery({ leftShop: true, sort: "moved", size: 100, q }))

/** The strip at the end of the board, which folds out into a column beside the others. From `md` up. */
export function LeftShopColumn({
  q,
  open,
  onOpenChange,
}: {
  q: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const list = useLeftShop(q)
  const rows = list.data?.items ?? []
  const problems = rows.filter((r) => r.statusView.status === "problem").length
  const column = useRef<HTMLElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const toggled = useRef(false)

  // On a board narrower than the column needs, opening brings it into view, also when a link opens the page that way.
  useEffect(() => {
    if (open) reveal(column.current)
    // The strip and the column replace each other, so focus follows the person who pressed one.
    if (toggled.current) toggle.current?.focus()
  }, [open])

  function change(next: boolean) {
    toggled.current = true
    onOpenChange(next)
  }

  return (
    <aside
      ref={column}
      aria-label={TITLE}
      onTransitionEnd={() => {
        if (open) reveal(column.current)
      }}
      className={cn(
        "ml-3 flex min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border transition-[width] duration-200 ease-out motion-reduce:transition-none max-md:hidden",
        open ? "w-80" : "w-13 border-dashed border-input",
      )}
    >
      {open ? (
        <div className="flex h-full min-h-0 w-[318px] flex-col">
          <h2 className="flex h-12 shrink-0 items-center gap-2 pl-3 pr-1 text-base font-semibold">
            {TITLE}
            {list.data ? <TabsCount>{list.data.total}</TabsCount> : null}
            <Button
              ref={toggle}
              variant="ghost"
              size="icon"
              aria-label="Fold away"
              className="ml-auto"
              onClick={() => change(false)}
            >
              <X aria-hidden="true" />
            </Button>
          </h2>
          <p className="shrink-0 px-3 pb-2 text-sm text-muted-foreground">{NOTE}</p>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
            <Stages list={list} rows={rows} />
          </div>
          <div className="shrink-0 px-2 pb-2">
            <Foot rows={rows} total={list.data?.total ?? 0} />
          </div>
        </div>
      ) : (
        <button
          ref={toggle}
          type="button"
          aria-expanded={false}
          aria-label={
            list.data
              ? `${TITLE}, ${list.data.total} ${list.data.total === 1 ? "order" : "orders"}${problems > 0 ? `, ${problems} with a problem` : ""}`
              : TITLE
          }
          onClick={() => change(true)}
          className="flex min-h-0 w-full flex-1 cursor-pointer flex-col items-center gap-2.5 bg-transparent py-3 hover:bg-[var(--row-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronLeft aria-hidden="true" className="size-4 shrink-0" />
          {list.data ? <TabsCount>{list.data.total}</TabsCount> : null}
          {problems > 0 ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-destructive-fill" /> : null}
          <span className="text-sm font-semibold whitespace-nowrap [writing-mode:vertical-rl]">{TITLE}</span>
        </button>
      )}
    </aside>
  )
}

/** A phone has no room for a column at the end of the board: a button above it, opening from the bottom. */
export function LeftShopSheet({
  q,
  open,
  onOpenChange,
}: {
  q: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const list = useLeftShop(q)
  const rows = list.data?.items ?? []
  return (
    <>
      <Button variant="outline" className="justify-between md:hidden" onClick={() => onOpenChange(true)}>
        {TITLE}
        {list.data ? <TabsCount>{list.data.total}</TabsCount> : null}
      </Button>
      <ResponsiveSheet
        open={open && isMobile}
        onOpenChange={onOpenChange}
        title={TITLE}
        description={NOTE}
        footer={<Foot rows={rows} total={list.data?.total ?? 0} />}
      >
        <div>
          <Stages list={list} rows={rows} />
        </div>
      </ResponsiveSheet>
    </>
  )
}

function Stages({ list, rows }: { list: ReturnType<typeof useLeftShop>; rows: readonly OrderRow[] }) {
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />
  if (list.isPending) {
    return (
      <Loading label="Loading orders that have left the shop">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="ticket is-quiet mb-1.5">
            <span className="ticket__top">
              <Bone className="w-24" />
              <Bone className="ml-auto w-20" />
            </span>
            <Bone kind="small" className={cn("max-w-44", boneWidth(i))} />
          </div>
        ))}
      </Loading>
    )
  }
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing has left the shop yet today</p>
  }
  return STAGES.map((status) => {
    const inStage = rows.filter((r) => r.statusView.status === status)
    return inStage.length > 0 ? <Stage key={status} status={status} rows={inStage} /> : null
  })
}

function Stage({ status, rows }: { status: PackageStatus; rows: readonly OrderRow[] }) {
  return (
    <Collapsible defaultOpen={status !== "delivered"}>
      <CollapsibleTrigger className="group sticky top-0 z-10 flex min-h-10 w-full cursor-pointer items-center gap-2 bg-background px-1">
        <PackageStatusPill view={rows[0]!.statusView} showDetail={false} />
        <span className="text-sm font-semibold tabular-nums">{rows.length}</span>
        <ChevronDown
          aria-hidden="true"
          className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-1.5 pb-2">
        {rows.map((row) => (
          <LeftTicket key={row.id} row={row} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

/** A time today, in the words the run times use; a date before that. */
function movedWhen(iso: string): string {
  return new Date(iso).toDateString() === new Date().toDateString() ? timeOf(iso) : formatPlacedShort(iso)
}

function LeftTicket({ row }: { row: OrderRow }) {
  const view = row.statusView
  return (
    <Link
      to="/orders/$fulfillmentId"
      params={{ fulfillmentId: row.id }}
      search={{ left: "open" }}
      className="ticket is-quiet hover:bg-[var(--row-hover)]"
    >
      <span className="ticket__top">
        <span className="ticket__code">{row.orderNumber}</span>
        <span className="ml-auto text-sm tabular-nums text-muted-foreground">
          {row.status === "delivered" ? "Delivered" : "Left"} {movedWhen(row.movedAt)}
        </span>
      </span>
      <span className="ticket__meta">
        {row.itemCount} {row.itemCount === 1 ? "item" : "items"} · {deliveredByText(row.deliveredBy)}
      </span>
      {view.status === "problem" && view.detail ? <span className="text-sm text-destructive">{view.detail}</span> : null}
    </Link>
  )
}

function FootLink({ children, search }: { children: ReactNode; search: OrdersSearch }) {
  return (
    <Link
      to="/orders"
      search={search}
      className="flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground no-underline hover:bg-accent"
    >
      {children}
      <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  )
}

function Foot({ rows, total }: { rows: readonly OrderRow[]; total: number }) {
  return (
    <>
      {total > rows.length ? (
        <FootLink search={{ view: "table", leftShop: true, sort: "moved" }}>All {total} in the table</FootLink>
      ) : null}
      <FootLink search={{ view: "table", tab: "delivered" }}>Older orders in the table</FootLink>
    </>
  )
}
