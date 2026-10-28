import * as React from "react"

import { cn } from "../cn"

// shadcn's table with roomier rows. Numbers go right and tabular (`TableCell numeric`) so they can be
// compared down a column.
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm tabular-nums", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
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
        "border-b transition-colors hover:bg-(--row-hover) data-[state=selected]:bg-(--row-selected)",
        className
      )}
      {...props}
    />
  )
}

/** A column header. `numeric` must match its cells. */
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
        "h-10 whitespace-nowrap px-3 first:pl-4 last:pr-4 align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
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
          "flex h-10 w-full items-center gap-1 px-3 font-medium text-muted-foreground transition-colors outline-none hover:text-foreground",
          numeric ? "justify-end" : "justify-start"
        )}
      >
        {children}
        {direction ? (
          <span aria-hidden="true" className="text-xs leading-none text-primary">
            {direction === "asc" ? "\u25b2" : "\u25bc"}
          </span>
        ) : null}
      </button>
    </TableHead>
  )
}

/**
 * A body cell. `numeric` right-aligns with tabular figures (amounts, counts); `mono` is monospace on the
 * left (identifiers, SKUs).
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
        "whitespace-nowrap px-3 py-3 first:pl-4 last:pr-4 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        numeric && "text-right tabular-nums",
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
