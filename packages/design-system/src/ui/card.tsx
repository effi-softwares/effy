import * as React from "react"

import { cn } from "../cn"

// THE CARD (theme-adoption-prompt.md, Phase 2 §3).
//
// ⚠ BORDERED, NEVER SHADOWED, AND NEVER NESTED. A 1px `--border` on `--radius` (10px, the container
// step). `shadow-sm` was REMOVED rather than overridden per call site: the adopted design reserves
// shadows for floating layers only, and a shadowed card on a flat page is the single most visible
// way this theme gets diluted.
//
// ⚠ BODY ROWS ARE SEPARATED BY A HAIRLINE, NOT BY A SECOND CARD. A card inside a card is the layout
// the design never uses — it doubles the border, doubles the padding, and turns a list into a stack
// of boxes. `CardRow` below exists so that separation has a named primitive to reach for.
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col rounded-xl border border-border bg-card text-card-foreground",
        className
      )}
      {...props}
    />
  )
}

// The header row: an optional icon chip, then title + subtitle, then a spacer, then a count pill or a
// `label →` ghost link. 16–18px padding, matching the design's card padding.
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex items-center gap-2.5 px-4 py-3.5 [.border-b]:pb-3.5",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-[14.5px] font-semibold leading-none tracking-[-0.01em]",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("mt-1 text-[12.5px] text-muted-foreground", className)}
      {...props}
    />
  )
}

// Title + subtitle as one block, so the header's flex row keeps them together and the spacer pushes
// the action to the far edge. Without this the subtitle becomes a sibling of the action and the
// header collapses to one line at narrow widths.
function CardHeading({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-heading"
      className={cn("min-w-0 flex-1", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("flex shrink-0 items-center gap-1.5", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("px-4 pb-4", className)} {...props} />
  )
}

/**
 * A body row inside a card. Rows are separated from each other by a hairline — the LAST row carries
 * no rule, which is what stops a card ending in a stray line just above its own border.
 */
function CardRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-row"
      className={cn(
        "flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-4 pb-4 [.border-t]:pt-3.5", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardHeading,
  CardDescription,
  CardContent,
  CardRow,
}
