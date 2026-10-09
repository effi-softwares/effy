import { useState } from "react";

import { OrdersTabs } from "./OrdersTabs";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";

import type { HandoverDueFilter, HandoverRowDTO } from "@effy/shared-types";
import { Tabs, TabsList, TabsTrigger } from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { formatDeliveryDay } from "./model";
import { handoversQuery } from "./queries";

/**
 * Standard packages to hand to the carrier (069 US7).
 *
 * A customer now chooses the day a standard order arrives, and Effy keeps that promise by handing the
 * package to the carrier on the right day. This is the list of what has to leave the hub, by when.
 *
 * ⚠ A TABLE WITH A FILTER, NO METRIC TILES (Principle V). "3 overdue" as a tile would tell staff how
 * many there are; the Overdue tab takes them to the three.
 *
 * ⚠ READ-ONLY, FOR EVERY ROLE. The handover itself is recorded on the order, where the carrier and
 * reference are entered and where only admin/manager may do it. This list is how anyone — a csa
 * included — finds out what is due.
 */
const FILTERS: { value: HandoverDueFilter; label: string; empty: string }[] = [
  { value: "today", label: "Due today", empty: "Nothing is due to be handed over today." },
  { value: "overdue", label: "Overdue", empty: "Nothing is overdue." },
  { value: "upcoming", label: "Upcoming", empty: "Nothing is waiting for a later day." },
];

const columns: ColumnDef<HandoverRowDTO>[] = [
  {
    accessorKey: "orderNumber",
    header: "Order",
    cell: ({ row }) => (
      <Link
        to="/orders/$orderId"
        params={{ orderId: row.original.orderId }}
        className="font-mono font-medium text-primary hover:underline"
      >
        {row.original.orderNumber}
      </Link>
    ),
  },
  {
    accessorKey: "promisedDate",
    header: "Customer's day",
    // 079 — an order sold as a courier delivery was told an estimate, not a day.
    cell: ({ row }) =>
      row.original.promisedDate ? (
        <span className="tabular-nums">{formatDeliveryDay(row.original.promisedDate)}</span>
      ) : (
        <span className="text-muted-foreground">No day — courier estimate</span>
      ),
  },
  {
    accessorKey: "handoverDueOn",
    header: "Hand over by",
    cell: ({ row }) => <span className="tabular-nums">{formatDeliveryDay(row.original.handoverDueOn)}</span>,
  },
  {
    id: "where",
    header: "Where it is",
    // ⚠ "Not at the hub yet" is the row staff most need: due out today and still to be collected.
    cell: ({ row }) => (row.original.atHub ? "At the hub" : "Not at the hub yet"),
  },
  {
    id: "risk",
    header: "",
    cell: ({ row }) =>
      row.original.atRisk ? <span className="text-warning">At risk of missing its day</span> : null,
  },
];

export function HandoverListScreen() {
  const [due, setDue] = useState<HandoverDueFilter>("today");
  const { data, error, isPending, isError, refetch } = useQuery(handoversQuery(due));
  const filter = FILTERS.find((f) => f.value === due)!;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Carrier handover</h1>
        <p className="max-w-2xl text-muted-foreground">
          Standard orders arrive on the day the customer chose. Each package has to be handed to the
          carrier early enough to make it. Open an order to record its handover.
        </p>
      </div>
      <OrdersTabs />

      <Tabs value={due} onValueChange={(v) => setDue(v as HandoverDueFilter)}>
        <TabsList>
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{filter.empty}</p>
      ) : (
        <DataTable columns={columns} data={data} />
      )}
    </div>
  );
}
