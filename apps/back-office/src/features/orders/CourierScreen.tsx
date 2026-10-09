import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";

import type { CourierView, HandoverRowDTO } from "@effy/shared-types";
import { Tabs, TabsList, TabsTrigger } from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { CONSIGNMENT_STATE_LABEL } from "./components/ConsignmentBlock";
import { OrdersTabs } from "./OrdersTabs";
import { courierParcelsQuery } from "./queries";

/**
 * Courier parcels (080): everything a courier takes that is not finished, in five views.
 *
 *   At the hub, due   collected (or still to collect), not handed over, due by the next pickup
 *   At the hub, late  the pickup it was due for has gone
 *   Supplier pickups  a courier collects from the supplier — booked or still to arrange
 *   With the courier  handed over, not delivered; overdue first
 *   Problems          failed, lost, damaged or returned, until resolved
 *
 * ⚠ A TABLE WITH VIEWS, NO METRIC TILES (Principle V). Read-only for every role; bookings and steps
 * are recorded on the order.
 */
const VIEWS: { value: CourierView; label: string; empty: string }[] = [
  { value: "hub_due", label: "At the hub", empty: "No courier parcels are waiting at the hub." },
  { value: "hub_late", label: "Late at the hub", empty: "Nothing has missed its pickup." },
  { value: "supplier", label: "Supplier pickups", empty: "No pickups from suppliers are waiting." },
  { value: "with_courier", label: "With the courier", empty: "Nothing is with a courier right now." },
  { value: "problems", label: "Problems", empty: "No problems reported." },
];

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Melbourne" }).format(new Date(iso));

const columns: ColumnDef<HandoverRowDTO>[] = [
  {
    accessorKey: "orderNumber",
    header: "Order",
    cell: ({ row }) => (
      <Link to="/orders/$orderId" params={{ orderId: row.original.orderId }} className="font-mono font-medium text-primary hover:underline">
        {row.original.orderNumber}
      </Link>
    ),
  },
  { id: "service", header: "Courier service", cell: ({ row }) => row.original.service ?? <span className="text-muted-foreground">Not set</span> },
  {
    id: "when",
    header: "Due",
    cell: ({ row }) => {
      const r = row.original;
      if (r.pickup) return <span className="tabular-nums">Pickup {r.pickup.date}{r.pickup.from ? `, ${r.pickup.from}–${r.pickup.to}` : ""}</span>;
      if (r.collection === "supplier") return <span className="text-muted-foreground">Pickup to arrange</span>;
      return r.dueOut ? <span className="tabular-nums">{when(r.dueOut)}</span> : <span className="tabular-nums">{r.handoverDueOn}</span>;
    },
  },
  {
    id: "where",
    header: "Where it is",
    cell: ({ row }) => {
      const r = row.original;
      if (r.consignmentState) return CONSIGNMENT_STATE_LABEL[r.consignmentState];
      if (r.collection === "supplier") return "At the supplier";
      return r.atHub ? "At the hub" : "Not at the hub yet";
    },
  },
  {
    id: "flag",
    header: "",
    cell: ({ row }) => (row.original.atRisk ? <span className="text-warning">Late</span> : null),
  },
];

export function CourierScreen() {
  const [view, setView] = useState<CourierView>("hub_due");
  const { data, error, isPending, isError, refetch } = useQuery(courierParcelsQuery(view));
  const current = VIEWS.find((v) => v.value === view)!;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Courier parcels</h1>
        <p className="max-w-2xl text-muted-foreground">
          Parcels a courier takes to customers outside Effy's area. Open an order to book its consignment and record each step.
        </p>
      </div>
      <OrdersTabs />
      <Tabs value={view} onValueChange={(v) => setView(v as CourierView)}>
        <TabsList>
          {VIEWS.map((v) => <TabsTrigger key={v.value} value={v.value}>{v.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{current.empty}</p>
      ) : (
        <DataTable columns={columns} data={data} />
      )}
    </div>
  );
}
