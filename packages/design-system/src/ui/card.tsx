import * as React from "react"

import { cn } from "../cn"

// The card: bordered, never shadowed, never nested. Body rows are separated by a hairline (`CardRow`),
// not by a second card.
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

// The header row: optional icon chip, title and subtitle, spacer, then a count pill or a `label →` link.
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

// Title and subtitle as one block, so the spacer pushes the action to the edge at narrow widths.
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

/** A body row. The last row carries no rule, so the card does not end in a stray line. */
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
