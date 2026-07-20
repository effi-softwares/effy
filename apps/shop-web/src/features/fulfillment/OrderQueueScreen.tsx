import { useEffect, useState } from "react";

import { track } from "@/lib/telemetry";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";

import { Tabs, TabsList, TabsTrigger } from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { FulfillmentStatusBadge } from "./components/FulfillmentStatusBadge";
import { PromiseCell } from "./components/PromiseCell";
import { formatTime, type FulfillmentQueueState, type FulfillmentSummary } from "./model";
import { fulfillmentQueueQuery } from "./queries";

/**
 * Queue columns (US1). Declared at module scope — they are pure presentation and must not be
 * re-created per render (the DataTable is deliberately dumb and re-memoises nothing for us).
 *
 * ⚠ The row ORDER is the server's — promise first, then arrival, which today IS strict FIFO
 * (FR-001b, SC-020). There is no client-side sort here and there must never be one: an at-risk row
 * escalates by PROMINENCE in place (SC-018), never by moving, because a queue that reshuffles under
 * a working hand is how the wrong order gets picked.
 */
const columns: ColumnDef<FulfillmentSummary>[] = [
  {
    accessorKey: "orderNumber",
    header: "Order",
    cell: ({ row }) => (
      <Link
        to="/orders/$fulfillmentId"
        params={{ fulfillmentId: row.original.id }}
        className={
          row.original.atRisk
            ? "font-semibold text-amber-700 hover:underline dark:text-amber-400"
            : "font-medium hover:underline"
        }
      >
        {row.original.orderNumber}
      </Link>
    ),
  },
  {
    accessorKey: "placedAt",
    header: "Arrived",
    cell: ({ row }) => <span className="tabular-nums">{formatTime(row.original.placedAt)}</span>,
  },
  {
    id: "promise",
    header: "Ready by",
    cell: ({ row }) => (
      <PromiseCell promise={row.original.promise} atRisk={row.original.atRisk} />
    ),
  },
  {
    id: "items",
    header: "Items",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="tabular-nums">
          {row.original.gatheredCount}/{row.original.itemCount}
        </span>
        {row.original.unavailableCount > 0 ? (
          <div className="text-xs text-amber-700 dark:text-amber-400">
            {row.original.unavailableCount} unavailable
          </div>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "State",
    cell: ({ row }) => <FulfillmentStatusBadge status={row.original.status} />,
  },
];

/**
 * The shop's order queue (US1 + US4's completed view).
 *
 * The list is POLLED (see `fulfillmentQueueQuery`) so an order placed while the operator is standing
 * at the screen appears without them navigating away — the whole point of the story.
 *
 * Completed work is a separate slice of the SAME queue (`?state=completed`, FR-016) rather than a
 * second screen: same columns, same row affordances, so a shift handover reads exactly like live
 * work. Each state caches and polls under its own key.
 */
export function OrderQueueScreen() {
  const [state, setState] = useState<FulfillmentQueueState>("active");
  const { data, error, isPending, isError, refetch } = useQuery(fulfillmentQueueQuery(state));

  // Keyed on `state` only — this is "the operator looked at this slice of the queue", not "a poll
  // completed". Firing per refetch would emit an event every 15 seconds for an idle open tablet.
  useEffect(() => {
    track({ name: "shop_order_queue_viewed", state });
  }, [state]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Orders</h1>
        <p className="text-muted-foreground">
          Orders your shop must fulfil — most urgent first. Updates automatically.
        </p>
      </div>

      <Tabs value={state} onValueChange={(v) => setState(v as FulfillmentQueueState)}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
      </Tabs>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data.items}
            emptyMessage={
              state === "active"
                ? "No orders waiting. New orders appear here automatically."
                : "No completed orders yet."
            }
          />
          <p className="text-sm text-muted-foreground">
            {data.items.length} {state === "active" ? "active" : "completed"} order
            {data.items.length === 1 ? "" : "s"}
          </p>
        </>
      )}
    </div>
  );
}
