import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Truck } from "lucide-react";

import type { DeliveryStatus } from "@effy/shared-types";
import { DELIVERY_STATUSES } from "@effy/shared-types";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";

import { canManageDelivery } from "./access";
import { CreateZoneDialog } from "./components/CreateZoneDialog";
import type { DeliveryZone } from "./model";
import { zoneListQuery } from "./queries";

const PAGE_SIZE = 20;
const ALL_STATUSES = "all";

function StatusBadge({ status }: { status: DeliveryStatus }) {
  return <Badge variant={status === "active" ? "success" : "muted"}>{status}</Badge>;
}

const columns: ColumnDef<DeliveryZone>[] = [
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => (
      <Link
        to="/delivery-zones/$zoneId"
        params={{ zoneId: row.original.id }}
        className="font-mono font-medium text-primary hover:underline"
      >
        {row.original.code}
      </Link>
    ),
  },
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "postcodeCount",
    header: "Postcodes",
    cell: ({ row }) => <span className="tabular-nums">{row.original.postcodeCount}</span>,
  },
];

export function DeliveryZonesScreen() {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canManage = canManageDelivery(roles);

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<DeliveryStatus | typeof ALL_STATUSES>(ALL_STATUSES);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      status: status === ALL_STATUSES ? undefined : status,
      q: search.trim() || undefined,
    }),
    [page, status, search],
  );

  const { data, error, isPending, isError, refetch } = useQuery(zoneListQuery(params));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Delivery zones</h1>
          <p className="text-muted-foreground">
            Serviced areas, shop locations, and the (origin → destination) rate grid.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/delivery-zones/rates">
              <Truck />
              Rates &amp; locations
            </Link>
          </Button>
          {canManage ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              Create zone
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by code or name…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as DeliveryStatus | typeof ALL_STATUSES);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
            {DELIVERY_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <DataTable columns={columns} data={data.items} emptyMessage="No zones match your filter." />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {data.total} zone{data.total === 1 ? "" : "s"} · page {data.page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {canManage ? <CreateZoneDialog open={createOpen} onOpenChange={setCreateOpen} /> : null}
    </div>
  );
}
