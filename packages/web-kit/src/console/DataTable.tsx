import { useTable, type RowData } from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui";

import { effyFeatures, type EffyColumnDef } from "../data-table/column-meta";

/**
 * A presentational TanStack table on the design-system primitives. It renders exactly the rows it is
 * given: search, filtering and pagination are the parent's (server-side) job.
 *
 * @deprecated Use `@effy/web-kit/data-table` (`DataTable` for lists, `StaticTable` for bounded tables).
 */
export interface DataTableProps<TData extends RowData> {
  columns: EffyColumnDef<TData>[];
  data: TData[];
  emptyMessage?: string;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  emptyMessage = "No results.",
}: DataTableProps<TData>) {
  const table = useTable({ features: effyFeatures, columns, data });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
