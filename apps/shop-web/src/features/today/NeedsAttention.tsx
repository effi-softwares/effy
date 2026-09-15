import { Link } from "@tanstack/react-router"

import type { ShopAttentionItemDTO } from "@effy/shared-types"
import { Button } from "@effy/design-system/ui"

import { TodayEmptyState } from "./EmptyState"
import { track } from "@/lib/telemetry"

import { attentionHref, attentionRow, formatAge } from "./model"

/**
 * "Needs attention" — the card an operator opens the console to read (058, FR-004/FR-005).
 *
 * ⚠ EVERY ROW ENDS IN A VERB, and the verb is specific: Pick, Restock, Review, Approve. A list that
 * names a problem without taking you to the thing that resolves it makes the reader do a search they
 * should not have to do — and a generic "View" makes them work out what they are supposed to do when
 * they get there.
 *
 * ⚠ URGENCY IS A DOT AND WEIGHT, NEVER A HUE — except the one case that has earned a semantic
 * colour. The imported design used amber for "warning" throughout; amber is a third hue and the
 * platform has two (Principle V), and 041 had already swept amber out of these very screens. What
 * survives is `--destructive` on an EMPTY shelf, which is a real problem right now, and the neutral
 * ramp everywhere else. Rendered in greyscale this card loses nothing but the red dot.
 */
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
    <section className="bg-background overflow-hidden rounded-[var(--radius)] border">
      <header className="flex items-center gap-3 border-b px-[18px] py-4">
        <div className="grid min-w-0 gap-[3px]">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Needs attention</h2>
          <p className="text-muted-foreground text-[12.5px]">
            {oldestWaitingAt
              ? `Oldest item waiting ${formatAge(oldestWaitingAt, now)}`
              : "Nothing is waiting"}
          </p>
        </div>
        <div className="flex-1" />
        {openCount > 0 ? (
          // The design's badge was warning-soft on warning; monochrome here (research R15). Mono
          // digits so the count does not jitter as it changes width.
          <span className="bg-muted text-foreground grid h-[22px] min-w-[22px] place-items-center rounded-md px-[7px] font-mono text-xs font-semibold">
            {openCount}
          </span>
        ) : null}
      </header>

      {items.length === 0 ? (
        <div className="p-[18px]">
          <TodayEmptyState />
        </div>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={keyOf(item)}>
              <AttentionRow item={item} now={now} />
            </li>
          ))}
        </ul>
      )}

      <footer className="flex items-center gap-3 px-[18px] py-[13px]">
        <p className="text-muted-foreground text-[12.5px]">
          {more > 0 ? `Cleared items drop off automatically · ${more} more` : "Cleared items drop off automatically"}
        </p>
        <div className="flex-1" />
        <Link
          to="/orders"
          search={{ attention: "at_risk", sort: "placed", dir: "asc" }}
          className="text-muted-foreground hover:text-foreground text-[13px] font-medium no-underline"
        >
          Open queue →
        </Link>
      </footer>
    </section>
  )
}

function AttentionRow({ item, now }: { item: ShopAttentionItemDTO; now: number }) {
  const row = attentionRow(item, now)
  return (
    <div className="hover:bg-accent flex flex-wrap items-center gap-3 border-b px-[18px] py-[15px]">
      <span
        aria-hidden="true"
        className={
          row.tone === "problem"
            ? "bg-destructive size-[7px] shrink-0 rounded-full"
            : row.tone === "waiting"
              ? "bg-foreground size-[7px] shrink-0 rounded-full"
              : "bg-muted-foreground size-[7px] shrink-0 rounded-full"
        }
      />
      <div className="min-w-[140px] flex-1">
        <p className="text-[13.5px] font-medium text-pretty">{row.title}</p>
        <p className="text-muted-foreground mt-[3px] text-[12.5px]">{row.detail}</p>
      </div>
      <Button asChild variant="outline" className="h-[30px] px-[11px] text-[12.5px]">
        <Link
          to={attentionHref(item)}
          onClick={() => track({ name: "today_attention_acted", kind: item.kind })}
        >
          {row.action}
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
      return `${item.kind}:${item.productId}`
    case "refund_proposed":
      return `refund:${item.fulfillmentId}`
  }
}
