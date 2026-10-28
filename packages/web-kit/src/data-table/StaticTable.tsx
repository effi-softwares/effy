import { useMemo, useState, type ReactNode } from "react";

import { createSortedRowModel, useTable, type RowData, type SortingState } from "@tanstack/react-table";

import { cn } from "@effy/design-system";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortHead,
} from "@effy/design-system/ui";

import { effyFeatures, phoneAttrs, priorityClass, type EffyColumnDef } from "./column-meta";

/**
 * A bounded table inside a record page (an order's items, a refund list) or a small staff-made set (103
 * FR-021, FR-024): every row is already here, so it sorts in the browser and has no pager. Same cells, same
 * alignment and same phone layout as a list.
 */
export function StaticTable<T extends RowData>({
  columns,
  rows,
  getRowId,
  label,
  empty,
  initialSort,
  rowClassName,
  onRowClick,
  className,
  framed = true,
}: {
  columns: EffyColumnDef<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  label: string;
  /** Shown in the table when there are no rows. */
  empty?: ReactNode;
  /** A column id to sort by at first (sortable columns are those with `enableSorting` and an accessor). */
  initialSort?: { id: string; desc?: boolean };
  rowClassName?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  className?: string;
  /** Draw the bordered frame; off when the table already sits in a panel. */
  framed?: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ? [{ id: initialSort.id, desc: initialSort.desc ?? false }] : []);
  const data = useMemo(() => [...rows], [rows]);
  const table = useTable({
    features: { ...effyFeatures, sortedRowModel: createSortedRowModel() },
    columns,
    data,
    getRowId,
    enableSortingRemoval: false,
    state: { sorting },
    onSortingChange: setSorting,
  });

  return (
    <div className={cn(framed && "overflow-hidden rounded-lg border bg-card", className)}>
      <div className="overflow-x-auto max-md:overflow-visible">
        <table aria-label={label} className="ef-rtable w-full caption-bottom text-sm tabular-nums">
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const cls = cn(priorityClass(meta?.priority), meta?.className);
                  const content = header.isPlaceholder ? null : <table.FlexRender header={header} />;
                  if (header.column.getCanSort()) {
                    const dir = header.column.getIsSorted();
                    return (
                      <TableSortHead
                        key={header.id}
                        numeric={meta?.align === "numeric"}
                        className={cls}
                        direction={dir === false ? null : dir}
                        onSort={() => header.column.toggleSorting(dir === false ? header.column.getFirstSortDir() === "desc" : dir === "asc")}
                      >
                        {content}
                      </TableSortHead>
                    );
                  }
                  return (
                    <TableHead key={header.id} numeric={meta?.align === "numeric"} className={cls}>
                      {content}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 && empty ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} data-m="full" className="h-20 text-center text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(onRowClick && "cursor-pointer", rowClassName?.(row.original))}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    return (
                      <TableCell
                        key={cell.id}
                        numeric={meta?.align === "numeric"}
                        mono={meta?.align === "mono"}
                        className={cn(priorityClass(meta?.priority), meta?.className)}
                        {...phoneAttrs(meta)}
                      >
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
