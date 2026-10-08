import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";

import type { CustomerSearchResultDTO } from "@effy/shared-types";
import { Input, Tabs, TabsContent, TabsList, TabsTrigger } from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { PointsSettingsPanel } from "./components/PointsSettingsPanel";
import { formatPoints } from "./components/points-format";
import { customerSearchQuery } from "./queries";

const columns: ColumnDef<CustomerSearchResultDTO>[] = [
  {
    accessorKey: "name",
    header: "Customer",
    cell: ({ row }) => (
      <Link to="/customers/$customerId" params={{ customerId: row.original.id }} className="font-medium text-primary hover:underline">
        {row.original.name || row.original.email}
      </Link>
    ),
  },
  { accessorKey: "email", header: "Email" },
  { id: "points", header: "Points", cell: ({ row }) => <span className="tabular-nums">{formatPoints(row.original.points)}</span> },
  { id: "orders", header: "Orders", cell: ({ row }) => <span className="tabular-nums">{row.original.orderCount}</span> },
];

/**
 * Back-office customers (074). Find a customer — by order number or email — to see and change their
 * points.
 *
 * ⚠ SEARCH-FIRST, NOT A REGISTER. There is no "all customers" list: staff come here with a person in
 * mind (on the phone, or from an order), and a browsable list of every customer is a privacy surface
 * this feature does not need. A table of matches, no cards, no metric row (Principle V).
 */
export function CustomersScreen() {
  const [q, setQ] = useState("");
  const search = useQuery(customerSearchQuery(q.trim()));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Customers</h1>
        <p className="text-muted-foreground">Find a customer to see and change their points.</p>
      </div>

      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="settings">Points settings</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="space-y-4 pt-4">
          <Input
            placeholder="Order number or customer email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-sm"
            autoFocus
          />
          {q.trim().length < 3 ? (
            <p className="text-sm text-muted-foreground">Type an order number (EFY-…) or at least three letters of an email.</p>
          ) : search.isError ? (
            <ErrorState error={search.error} onRetry={() => void search.refetch()} />
          ) : search.isPending ? (
            <p className="text-sm text-muted-foreground">Searching…</p>
          ) : (
            <DataTable columns={columns} data={search.data} emptyMessage="No customer matches that." />
          )}
        </TabsContent>

        <TabsContent value="settings" className="pt-4">
          <PointsSettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
