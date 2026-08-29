import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { AWAITING_LABEL, STAGE_LABEL, type OrderSummary } from "./model";
import { ordersListQuery } from "./queries";

const ALL = "all";

/**
 * The back-office order register (053 US1).
 *
 * ⚠ A TABLE, NOT CARDS, AND NO METRIC ROW AT THE TOP (Principle V). An order list is exactly where
 * the dashboard-summary instinct fires — "orders today", "awaiting handover", "delivered this week"
 * as four tiles. The constitution forbids it, and the filter below does the same job honestly: it
 * takes you to the rows rather than telling you how many there are.
 */

function formatMoney(amount: string, currency: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${currency} ${amount}`;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency || "AUD",
    currencyDisplay: "narrowSymbol",
  }).format(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(new Date(iso));
}

const columns: ColumnDef<OrderSummary>[] = [
  {
    accessorKey: "orderNumber",
    header: "Order",
    cell: ({ row }) => (
      <Link
        to="/orders/$orderId"
        params={{ orderId: row.original.id }}
        className="font-mono font-medium text-primary hover:underline"
      >
        {row.original.orderNumber}
      </Link>
    ),
  },
  { accessorKey: "customerEmail", header: "Customer" },
  {
    accessorKey: "placedAt",
    header: "Placed",
    cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.placedAt)}</span>,
  },
  {
    accessorKey: "stage",
    header: "Customer sees",
    // ⚠ SERVER-DERIVED, and labelled as what the CUSTOMER sees rather than as an internal status.
    // An operator answering the phone needs the shopper's words, not the fulfilment machine's.
    cell: ({ row }) => STAGE_LABEL[row.original.stage] ?? row.original.stage,
  },
  {
    accessorKey: "awaiting",
    header: "Next step",
    cell: ({ row }) =>
      row.original.awaiting ? (
        <span className="font-medium">{AWAITING_LABEL[row.original.awaiting]}</span>
      ) : (
        <span className="text-muted-foreground">Complete</span>
      ),
  },
  {
    accessorKey: "grandTotalAmount",
    header: "Total",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatMoney(row.original.grandTotalAmount, row.original.currency)}
      </span>
    ),
  },
];

export function OrdersListScreen() {
  const [search, setSearch] = useState("");
  const [awaiting, setAwaiting] = useState<string>(ALL);
  /**
   * Keyset paging, so a stack rather than a page number.
   *
   * ⚠ A cursor list cannot jump to "page 5" — that is the trade for never showing an operator the
   * same order twice while new ones arrive. The stack is what makes Back possible; its length is the
   * only page number there is. Changing a filter resets it, because a cursor minted under one filter
   * means nothing under another.
   */
  const [cursors, setCursors] = useState<string[]>([]);

  const params = useMemo(
    () => ({
      q: search.trim() || undefined,
      awaiting: awaiting === ALL ? undefined : (awaiting as "handover" | "arrival"),
      cursor: cursors[cursors.length - 1],
    }),
    [search, awaiting, cursors],
  );

  const { data, error, isPending, isError, refetch } = useQuery(ordersListQuery(params));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Orders</h1>
        <p className="text-muted-foreground">
          Every paid order, what stage the customer sees, and what it is waiting on.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by order reference or customer email…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCursors([]);
          }}
          className="max-w-sm"
        />
        <Select
          value={awaiting}
          onValueChange={(v) => {
            setAwaiting(v);
            setCursors([]);
          }}
        >
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All orders</SelectItem>
            {/* The operator's work queue — derived from what is missing, never a stored state. */}
            <SelectItem value="handover">Needs handover</SelectItem>
            <SelectItem value="arrival">Awaiting arrival</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data.items}
            emptyMessage="No orders match your filter."
          />
          {/* Rendered only when there is somewhere to go — no dead controls on a single page. */}
          {cursors.length > 0 || data.nextCursor ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {data.items.length} order{data.items.length === 1 ? "" : "s"}
                {cursors.length > 0 ? ` · page ${cursors.length + 1}` : ""}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={cursors.length === 0}
                  onClick={() => setCursors((c) => c.slice(0, -1))}
                >
                  Back
                </Button>
                <Button
                  variant="outline"
                  disabled={!data.nextCursor}
                  onClick={() =>
                    setCursors((c) => (data.nextCursor ? [...c, data.nextCursor] : c))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
