import * as React from "react"

import { cn } from "../cn"

// THE TABLE (theme-adoption-prompt.md, Phase 2 §7).
//
// ⚠ TABLES ARE THE PLATFORM'S DEFAULT LAYOUT, not cards. The design lays out records as rows with a
// `--muted` header, hairline rules and an `--accent` hover — and the reason is legibility at density:
// an operator scanning 40 orders compares values down a column, which a grid of cards makes
// impossible.
//
// ⚠ NUMBERS GO RIGHT AND MONOSPACE. `TableCell numeric` does both. A currency column set in the
// proportional face cannot be compared by eye — the digits do not line up — and that is the single
// most common way a console table stops being scannable.
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-muted [&_tr]:border-b [&_tr]:border-border", className)}
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
        // ⚠ `--accent` on hover, not a translucent `--muted`. An alpha overlay over a tinted row
        // (selected, or a status-tinted row) compounds into a third colour that is in no palette.
        "border-b border-border transition-colors hover:bg-accent data-[state=selected]:bg-brand-soft",
        className
      )}
      {...props}
    />
  )
}

/**
 * A column header — the design's micro-label: 11.5px/500 uppercase at .04em, muted.
 *
 * ⚠ `numeric` must match the cells below it. A right-aligned column under a left-aligned header
 * reads as two columns, and it is the kind of mismatch nobody notices in review because each half
 * looks correct on its own.
 */
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
        "h-9 whitespace-nowrap px-3 align-middle text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        numeric ? "text-right" : "text-left",
        className
      )}
      {...props}
    />
  )
}

/**
 * A sortable column header: a full-width button carrying a direction arrow.
 *
 * ⚠ FULL WIDTH ON PURPOSE. A button sized to its text leaves most of the header cell dead, so a
 * click an inch away from the word does nothing — which people read as the sort being broken rather
 * than as having missed a target.
 *
 * ⚠ The arrow is rendered only for the ACTIVE column. An arrow on every header says every column is
 * sorted; a neutral glyph everywhere says nothing and adds noise to a row that is already dense.
 */
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
          "flex h-9 w-full items-center gap-1 px-3 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-muted",
          numeric ? "justify-end" : "justify-start"
        )}
      >
        {children}
        {direction ? (
          <span aria-hidden="true" className="text-[9px] leading-none text-brand">
            {direction === "asc" ? "\u25b2" : "\u25bc"}
          </span>
        ) : null}
      </button>
    </TableHead>
  )
}

/**
 * A body cell. `--rowpad` (12px) vertical, 13.5px type.
 *
 * `numeric` right-aligns and sets tabular monospace — use it for every amount, count and quantity.
 * `mono` sets monospace WITHOUT right-aligning — for identifiers, SKUs and dates, which read as
 * labels rather than as quantities and so stay on the left.
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
        "whitespace-nowrap px-3 py-(--rowpad) align-middle text-[13.5px] [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
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
