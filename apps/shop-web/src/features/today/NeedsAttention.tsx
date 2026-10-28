import { Link } from "@tanstack/react-router"

import type { ShopAttentionItemDTO } from "@effy/shared-types"
import { ArrowDown, ChevronRight, ClipboardList, PackageX, ReceiptText, type LucideIcon } from "lucide-react"

import { cn } from "@effy/design-system"
import { Button, TabsCount } from "@effy/design-system/ui"
import { Panel } from "@effy/web-kit/patterns"

import { TodayEmptyState } from "./EmptyState"
import { track } from "@/lib/telemetry"

import { attentionHref, attentionRow, formatAge } from "./model"

export function NeedsAttention({
  items,
  more,
  oldestWaitingAt,
  now,
}: {
  items: readonly ShopAttentionItemDTO[]
  more: number
  oldestWaitingAt: string | null
  now: number
}) {
  const openCount = items.length + more

  return (
    <Panel
      flush
      title={
        <>
          Needs attention
          {openCount > 0 ? <TabsCount tone="primary">{openCount}</TabsCount> : null}
        </>
      }
      description={oldestWaitingAt ? `Oldest item waiting ${formatAge(oldestWaitingAt, now)}` : "Nothing is waiting"}
      footerBetween
      footer={
        <>
          <p className="text-sm text-muted-foreground">
            {more > 0 ? `Cleared items drop off automatically · ${more} more` : "Cleared items drop off automatically"}
          </p>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/orders" search={{ attention: "at_risk", sort: "placed", dir: "asc" }}>
              Open queue →
            </Link>
          </Button>
        </>
      }
    >
      {items.length === 0 ? (
        <TodayEmptyState />
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li key={keyOf(item)}>
              <AttentionRow item={item} now={now} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

const ROW_ICON: Record<ShopAttentionItemDTO["kind"], LucideIcon> = {
  awaiting_pick: ClipboardList,
  out_of_stock: PackageX,
  low_stock: ArrowDown,
  refund_proposed: ReceiptText,
}

function AttentionRow({ item, now }: { item: ShopAttentionItemDTO; now: number }) {
  const row = attentionRow(item, now)
  const Icon = ROW_ICON[item.kind]
  return (
    <div className="flex min-h-16 flex-wrap items-center gap-4 px-5 py-3 max-md:gap-3 max-md:px-4">
      <span
        aria-hidden="true"
        className={cn(
          "grid size-9 flex-none place-items-center rounded-lg bg-muted text-foreground [&_svg]:size-4",
          row.tone === "problem" && "bg-foreground text-background",
          item.kind === "awaiting_pick" && "bg-primary-muted text-primary",
        )}
      >
        <Icon />
      </span>
      <div className="min-w-40 flex-auto">
        <p className="text-sm font-medium text-pretty">{row.title}</p>
        <p className="text-sm text-muted-foreground">{row.detail}</p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to={attentionHref(item)} onClick={() => track({ name: "today_attention_acted", kind: item.kind })}>
          {row.action}
          <ChevronRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  )
}

function keyOf(item: ShopAttentionItemDTO): string {
  switch (item.kind) {
    case "awaiting_pick":
      return "awaiting_pick"
    case "out_of_stock":
    case "low_stock":
      // One row per size: two sizes of one product can both be low.
      return `${item.kind}:${item.variantId}`
    case "refund_proposed":
      return `refund:${item.fulfillmentId}`
  }
}
