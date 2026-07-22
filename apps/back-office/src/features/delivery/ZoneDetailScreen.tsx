import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";

import type { DeliveryStatus } from "@effy/shared-types";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";

import { canManageDelivery } from "./access";
import { AddPostcodesDialog } from "./components/AddPostcodesDialog";
import { CreateZoneDialog } from "./components/CreateZoneDialog";
import type { DeliveryZone, ZonePostcode } from "./model";
import {
  useRemovePostcode,
  useUpdateZone,
  zoneHistoryQuery,
  zoneListQuery,
  zonePostcodesQuery,
} from "./queries";

const POSTCODE_PAGE_SIZE = 100;
const HISTORY_PAGE_SIZE = 10;

function StatusBadge({ status }: { status: DeliveryStatus }) {
  return <Badge variant={status === "active" ? "success" : "muted"}>{status}</Badge>;
}

export function ZoneDetailScreen({ zoneId }: { zoneId: string }) {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canManage = canManageDelivery(roles);

  const navigate = useNavigate();

  // There is no single-zone GET in the contract (§C), so the header is resolved from the register.
  const { data: zonePage, error, isPending, isError, refetch } = useQuery(
    zoneListQuery({ page: 1, pageSize: 100 }),
  );
  const zone = zonePage?.items.find((z) => z.id === zoneId);

  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const updateZone = useUpdateZone(zoneId);

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!zone) return <p className="text-sm text-muted-foreground">Zone not found.</p>;

  const nextStatus: DeliveryStatus = zone.status === "active" ? "disabled" : "active";

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/delivery-zones" })}>
          <ArrowLeft />
          All zones
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{zone.name}</h1>
            <StatusBadge status={zone.status} />
          </div>
          <p className="font-mono text-sm text-muted-foreground">{zone.code}</p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil />
              Rename
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={updateZone.isPending}
              onClick={() => updateZone.mutate({ status: nextStatus })}
            >
              {zone.status === "active" ? "Disable" : "Enable"}
            </Button>
          </div>
        ) : null}
      </div>

      <section className="space-y-3">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <Field label="Code" value={zone.code} mono />
          <Field label="Postcodes" value={String(zone.postcodeCount)} />
          <Field label="Updated" value={formatTime(zone.updatedAt)} />
        </dl>
      </section>

      <PostcodesSection zoneId={zoneId} canManage={canManage} onAdd={() => setAddOpen(true)} />

      <HistorySection zoneId={zoneId} />

      {canManage ? (
        <>
          <CreateZoneDialog open={editOpen} onOpenChange={setEditOpen} zone={zone} />
          <AddPostcodesDialog zoneId={zoneId} open={addOpen} onOpenChange={setAddOpen} />
        </>
      ) : null}
    </div>
  );
}

function PostcodesSection({
  zoneId,
  canManage,
  onAdd,
}: {
  zoneId: string;
  canManage: boolean;
  onAdd: () => void;
}) {
  const { data, error, isPending, isError, refetch } = useQuery(
    zonePostcodesQuery(zoneId, 1, POSTCODE_PAGE_SIZE),
  );
  const removePostcode = useRemovePostcode(zoneId);

  const columns = useMemo<ColumnDef<ZonePostcode>[]>(() => {
    const base: ColumnDef<ZonePostcode>[] = [
      { accessorKey: "postcode", header: "Postcode", cell: ({ row }) => (
          <span className="font-mono tabular-nums">{row.original.postcode}</span>
        ) },
    ];
    if (canManage) {
      base.push({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              variant="ghost"
              size="sm"
              disabled={removePostcode.isPending}
              onClick={() => removePostcode.mutate(row.original.postcode)}
            >
              <Trash2 />
              Remove
            </Button>
          </div>
        ),
      });
    }
    return base;
  }, [canManage, removePostcode]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Postcodes</h2>
        {canManage ? (
          <Button variant="outline" size="sm" onClick={onAdd}>
            <Plus />
            Add postcodes
          </Button>
        ) : null}
      </div>
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <DataTable columns={columns} data={data.items} emptyMessage="No postcodes assigned yet." />
      )}
    </section>
  );
}

function HistorySection({ zoneId }: { zoneId: string }) {
  const [page, setPage] = useState(1);
  const { data, error, isPending, isError, refetch } = useQuery(
    zoneHistoryQuery(zoneId, page, HISTORY_PAGE_SIZE),
  );
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">History</h2>
        <p className="text-sm text-muted-foreground">Audit trail of changes to this zone.</p>
      </div>
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                      No history yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-muted-foreground">{formatTime(entry.createdAt)}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.actorSub}</TableCell>
                      <TableCell>{entry.action}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {data.total} entr{data.total === 1 ? "y" : "ies"} · page {data.page} of {totalPages}
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
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono" : undefined}>{value}</dd>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
