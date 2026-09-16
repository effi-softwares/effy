import { Link } from "@tanstack/react-router"

import type { ShopAttentionItemDTO } from "@effy/shared-types"
import { Button, IconChip } from "@effy/design-system/ui"

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
 * ⚠ URGENCY IS A DOT, AND IT NOW CARRIES THE DESIGN'S THREE TONES. Under the monochrome
 * constitution only `--destructive` was available, so "waiting" had to read as plain foreground and
 * looked identical to "nothing urgent". The adopted palette supplies `--warning`, which is exactly
 * the missing middle: destructive = a shelf is empty RIGHT NOW, warning = something is waiting and
 * ageing, muted = noted, not urgent.
 *
 * ⚠ THE DOT IS NEVER THE ONLY SIGNAL. Every row states its situation in words and ends in a specific
 * verb, so the card reads identically in greyscale and to a screen reader.
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
        <IconChip tone="warning" size="lg" className="mt-0.5">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M8 4.5v4" />
            <path d="M8 11.2h.01" />
            <path d="M8 1.8 14.6 13.4H1.4Z" strokeLinejoin="round" />
          </svg>
        </IconChip>
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
          // ⚠ The design's own warning-soft-on-warning badge, restored. Mono digits so the count does
          // not jitter sideways as it changes width — it updates live.
          <span className="grid h-[22px] min-w-[22px] place-items-center rounded-md bg-warning-soft px-[7px] font-mono text-xs font-semibold tabular-nums text-warning">
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
              ? "bg-warning size-[7px] shrink-0 rounded-full"
              : "bg-muted-foreground size-[7px] shrink-0 rounded-full"
        }
      />
      <div className="min-w-[140px] flex-1">
        <p className="text-[13.5px] font-medium text-pretty">{row.title}</p>
        <p className="text-muted-foreground mt-[3px] text-[12.5px]">{row.detail}</p>
      </div>
      <Button asChild variant="outline" size="compact">
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
