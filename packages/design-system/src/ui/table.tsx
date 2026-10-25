import * as React from "react"

import { cn } from "../cn"

// The table, the platform's default layout for records: a `--muted` header, hairline rules, `--accent`
// hover. Numbers go right and monospace (`TableCell numeric`) so they can be compared down a column.
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-base leading-[1.42857] tabular-nums", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-card [&_tr]:border-b [&_tr]:border-border", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        // `--accent` on hover, not a translucent overlay that would compound with a tinted row.
        "border-b border-border transition-colors hover:bg-(--row-hover) data-[state=selected]:bg-(--row-selected)",
        className
      )}
      {...props}
    />
  )
}

/** A column header: 11.5px/500 uppercase at.04em, muted. `numeric` must match its cells. */
function TableHead({
  className,
  numeric,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      data-numeric={numeric ? "" : undefined}
      className={cn(
        "h-11 whitespace-nowrap bg-card px-3 first:pl-4 last:pr-4 align-middle text-sm font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-1",
        numeric ? "text-right" : "text-left",
        className
      )}
      {...props}
    />
  )
}

/** A sortable column header: full width so the whole cell is the target, with an arrow only on the active column. */
function TableSortHead({
  className,
  numeric,
  direction,
  children,
  onSort,
  ...props
}: Omit<React.ComponentProps<"th">, "onSort"> & {
  numeric?: boolean
  direction?: "asc" | "desc" | null
  onSort?: () => void
}) {
  return (
    <TableHead
      numeric={numeric}
      className={cn("p-0", className)}
      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}
      {...props}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "flex h-9 w-full items-center gap-1 px-3 text-xs font-medium uppercase tracking-[0.04em] text-muted-foreground transition-colors outline-none hover:text-foreground",
          numeric ? "justify-end" : "justify-start"
        )}
      >
        {children}
        {direction ? (
          <span aria-hidden="true" className="text-xs leading-none text-brand">
            {direction === "asc" ? "\u25b2" : "\u25bc"}
          </span>
        ) : null}
      </button>
    </TableHead>
  )
}

/**
 * A body cell: 12px (`--rowpad`) vertical, 13.5px. `numeric` right-aligns with tabular monospace (amounts,
 * counts); `mono` is monospace on the left (identifiers, SKUs, dates).
 */
function TableCell({
  className,
  numeric,
  mono,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean; mono?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "whitespace-nowrap px-3 py-4 first:pl-4 last:pr-4 align-middle text-base [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-1",
        numeric && "text-right font-mono tabular-nums",
        mono && !numeric && "font-mono",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableSortHead,
  TableRow,
  TableCell,
  TableCaption,
}
