import { Link } from "@tanstack/react-router"
import { AlertTriangle, ChevronRight, ClipboardList, PackageSearch } from "lucide-react"

import type { AttentionItem } from "./model"

/**
 * "Needs attention" (US1, FR-007) — the list an operator opens the console to read.
 *
 * ⚠ EVERY ROW IS A LINK, and that is the requirement rather than a nicety: a list that names a
 * problem without taking you to it makes the reader do a search they should not have to do. Orders
 * go to their pick screen, products to their Inventory tab.
 *
 * ⚠ URGENCY IS WEIGHT AND A GLYPH, NEVER A HUE (Principle V, research R3). The imported mockup used
 * amber here; 041 had already removed amber from these very screens, and a shop floor in bright light
 * is the worst place to depend on a tint. Rendered in greyscale this list loses nothing.
 *
 * ⚠ A LIST, NOT CARDS (Principle V / DOCTRINE-2). Rows of one-line facts are what this is.
 */
export function NeedsAttention({ items }: { items: readonly AttentionItem[] }) {
  if (items.length === 0) return null

  return (
    <ul className="divide-border divide-y rounded-md border">
      {items.map((item) => (
        <li key={`${item.kind}:${item.id}`}>
          <AttentionRow item={item} />
        </li>
      ))}
    </ul>
  )
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className="text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md border"
      >
        {item.kind === "order" ? (
          <ClipboardList className="size-4" />
        ) : (
          <PackageSearch className="size-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={
            item.urgent ? "block truncate font-semibold" : "block truncate font-medium"
          }
        >
          {item.title}
        </span>
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          {item.urgent ? <AlertTriangle className="size-3 shrink-0" aria-hidden="true" /> : null}
          {item.detail}
        </span>
      </span>
      <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
    </>
  )

  const className =
    "hover:bg-accent focus-visible:ring-ring flex items-center gap-3 px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"

  return item.kind === "order" ? (
    <Link to="/orders/$fulfillmentId" params={{ fulfillmentId: item.id }} className={className}>
      {body}
    </Link>
  ) : (
    <Link to="/catalog/$productId" params={{ productId: item.id }} className={className}>
      {body}
    </Link>
  )
}
