import { Link } from "@tanstack/react-router"

import type { ShopAttentionItemDTO } from "@effy/shared-types"
import { ArrowDown, ChevronRight, ClipboardList, PackageX, ReceiptText, type LucideIcon } from "lucide-react"

import { cn } from "@effy/design-system"
import { Button, TabsCount } from "@effy/design-system/ui"

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
    <section className="ef-panel min-w-0">
      <div className="ef-panel__head">
        <div className="min-w-0 flex-1">
          <h2 className="ef-panel__title">
            Needs attention
            {openCount > 0 ? <TabsCount tone="primary">{openCount}</TabsCount> : null}
          </h2>
          <p className="ef-panel__desc">
            {oldestWaitingAt ? `Oldest item waiting ${formatAge(oldestWaitingAt, now)}` : "Nothing is waiting"}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="ef-panel__body">
          <TodayEmptyState />
        </div>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={keyOf(item)} className="border-b border-border">
              <AttentionRow item={item} now={now} />
            </li>
          ))}
        </ul>
      )}

      <div className="ef-panel__foot ef-panel__foot--between">
        <p className="text-sm text-muted-foreground">
          {more > 0 ? `Cleared items drop off automatically · ${more} more` : "Cleared items drop off automatically"}
        </p>
        <Link
          to="/orders"
          search={{ attention: "at_risk", sort: "placed", dir: "asc" }}
          className="text-sm font-medium text-foreground no-underline hover:underline"
        >
          Open queue →
        </Link>
      </div>
    </section>
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
    <div className="ef-attn flex-wrap">
      <span
        aria-hidden="true"
        className={cn(
          "ef-icon-tile",
          row.tone === "problem" && "ef-icon-tile--problem",
          item.kind === "awaiting_pick" && "ef-icon-tile--primary",
        )}
      >
        <Icon />
      </span>
      <div className="ef-attn__text min-w-40">
        <p className="ef-attn__title text-pretty">{row.title}</p>
        <p className="ef-attn__desc">{row.detail}</p>
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
