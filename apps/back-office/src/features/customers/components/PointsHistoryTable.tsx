import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";

import { POINTS_REASON_LABELS, type StaffPointsHistoryEntryDTO } from "@effy/shared-types";
import { Button } from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { usePointsHistory } from "../queries";
import { formatDay, formatPoints } from "./points-format";

const when = (iso: string) => new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

const columns: ColumnDef<StaffPointsHistoryEntryDTO>[] = [
  { id: "at", header: "When", cell: ({ row }) => <span className="tabular-nums">{when(row.original.at)}</span> },
  {
    id: "points",
    header: "Points",
    cell: ({ row }) => (
      <span className={`tabular-nums font-medium ${row.original.points < 0 ? "text-muted-foreground" : ""}`}>
        {formatPoints(row.original.points, true)}
      </span>
    ),
  },
  {
    id: "reason",
    header: "Reason",
    cell: ({ row }) => (
      <span className="space-y-0.5">
        <span className="block">{POINTS_REASON_LABELS[row.original.reason] ?? row.original.reason}</span>
        {/* ⚠ Internal: shown to staff, never to the customer. */}
        {row.original.note ? <span className="block text-sm text-muted-foreground">{row.original.note}</span> : null}
      </span>
    ),
  },
  {
    id: "customerSees",
    header: "Customer sees",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.words}</span>,
  },
  {
    id: "order",
    header: "Order",
    cell: ({ row }) =>
      row.original.orderId && row.original.orderNumber ? (
        <Link to="/orders/$orderId" params={{ orderId: row.original.orderId }} className="font-mono text-primary hover:underline">
          {row.original.orderNumber}
        </Link>
      ) : (
        "—"
      ),
  },
  { id: "by", header: "By", cell: ({ row }) => row.original.authorName },
  {
    id: "expires",
    header: "Usable until",
    cell: ({ row }) => (row.original.expiresOn ? <span className="tabular-nums">{formatDay(row.original.expiresOn)}</span> : "—"),
  },
];

/** Every change to a customer's points, newest first (074). A table, never cards (Principle V). */
export function PointsHistoryTable({ customerId }: { customerId: string }) {
  const history = usePointsHistory(customerId);
  if (history.isError) return <ErrorState error={history.error} onRetry={() => void history.refetch()} />;
  if (history.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const rows = history.data.pages.flatMap((p) => p.entries);
  return (
    <div className="space-y-3">
      <DataTable columns={columns} data={rows} emptyMessage="No points yet." />
      {history.hasNextPage ? (
        <Button variant="outline" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
          {history.isFetchingNextPage ? "Loading…" : "Show older"}
        </Button>
      ) : null}
    </div>
  );
}
