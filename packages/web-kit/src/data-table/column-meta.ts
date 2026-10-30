import {
  columnVisibilityFeature,
  createSortedRowModel,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";

/**
 * What a column says about itself, declared once with the column (103). Everything a screen used to do by
 * hand on each cell - hiding below a breakpoint, aligning figures, placing the cell in the phone layout,
 * naming its server sort - is derived from this.
 */
export interface EffyColumnMeta {
  /** The header text and the column menu's name for it. */
  label: string;
  /** `numeric`: right-aligned even-width figures (amounts, counts). `mono`: codes (order numbers, SKUs). */
  align?: "numeric" | "mono";
  /** 1 always shown; 2 hidden from `md` to below `lg`; 3 hidden from `md` to below `xl`. Default 1. */
  priority?: 1 | 2 | 3;
  /** Where the cell goes when a row becomes a stacked entry on a phone (`ef-rtable`). Default `meta`. */
  phone?: "primary" | "meta" | "badge" | "trail" | "hide" | "full";
  /** The server's sort key; a column without one does not sort. */
  sortKey?: string;
  /** The record's identifying column: never hidden, by width or by choice. One per table. */
  identifying?: true;
  /** Extra classes for this column's header and cells (a fixed width, a truncation). */
  className?: string;
}

/**
 * The features every console table registers. Lists sort, page and select on the server (`manual*`); the
 * sorted row model is only consulted by `StaticTable`, whose rows are already all in the browser.
 */
export const effyFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, datetime: sortFn_datetime, text: sortFn_text },
  columnMeta: {} as EffyColumnMeta,
});

export type EffyFeatures = typeof effyFeatures;

/** A console table column. `TValue` is left open so accessor columns of any value type mix in one array. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EffyColumnDef<TData extends RowData> = ColumnDef<EffyFeatures, TData, any>;

/**
 * The breakpoint class a column's priority asks for. Only from `md` up: below it the row is a stacked entry
 * and `phone` decides what shows.
 */
export function priorityClass(priority: EffyColumnMeta["priority"]): string | undefined {
  if (priority === 2) return "md:max-lg:hidden";
  if (priority === 3) return "md:max-xl:hidden";
  return undefined;
}

/** The attributes `ef-rtable` reads to lay a row out as a stacked entry on a phone. */
export function phoneAttrs(meta: EffyColumnMeta | undefined): { "data-m": string; "data-label"?: string } {
  const m = meta?.phone ?? "meta";
  return m === "meta" && meta?.label ? { "data-m": m, "data-label": meta.label } : { "data-m": m };
}
