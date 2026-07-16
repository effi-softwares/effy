import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ListChecks, Pencil, Plus } from "lucide-react";

import { Button } from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import type { ProductType } from "../model";
import { productTypesQuery, useChangeProductTypeStatus } from "../queries";
import { ManageAttributesDialog } from "./ManageAttributesDialog";
import { ProductTypeDialog } from "./ProductTypeDialog";
import { RetireControl } from "./RetireControl";
import { SchemaStatusBadge } from "./StatusBadge";
import { StatusFilter, type StatusFilterValue } from "./StatusFilter";

// The Product Types tab: a sectioned table (no cards) with per-type edit, attribute assignment, and
// retire/activate. Reads for every role; mutating controls only when `canManage` (backend remains
// authoritative). Status filtering is client-side (the list endpoint is an unpaginated array).
export function ProductTypesTab({ canManage }: { canManage: boolean }) {
  const { data, error, isPending, isError, refetch } = useQuery(productTypesQuery());
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ProductType | null>(null);
  const [managing, setManaging] = useState<ProductType | null>(null);

  const rows = useMemo(
    () => (data ?? []).filter((t) => statusFilter === "all" || t.status === statusFilter),
    [data, statusFilter],
  );

  const columns = useMemo<ColumnDef<ProductType>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{row.original.key}</span>
          </div>
        ),
      },
      {
        id: "attributes",
        header: "Attributes",
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.attributes.length}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <SchemaStatusBadge status={row.original.status} />,
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: () => <span className="sr-only">Actions</span>,
              cell: ({ row }: { row: { original: ProductType } }) => (
                <ProductTypeActions
                  type={row.original}
                  onEdit={() => setEditing(row.original)}
                  onManage={() => setManaging(row.original)}
                />
              ),
            } satisfies ColumnDef<ProductType>,
          ]
        : []),
    ],
    [canManage],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        {canManage ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus />
            New type
          </Button>
        ) : null}
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <DataTable columns={columns} data={rows} emptyMessage="No product types yet." />
      )}

      {canManage ? (
        <>
          <ProductTypeDialog open={createOpen} onOpenChange={setCreateOpen} />
          {editing ? (
            <ProductTypeDialog
              productType={editing}
              open
              onOpenChange={(o) => !o && setEditing(null)}
            />
          ) : null}
          {managing ? (
            <ManageAttributesDialog
              productType={managing}
              open
              onOpenChange={(o) => !o && setManaging(null)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ProductTypeActions({
  type,
  onEdit,
  onManage,
}: {
  type: ProductType;
  onEdit: () => void;
  onManage: () => void;
}) {
  const changeStatus = useChangeProductTypeStatus(type.id);
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" onClick={onManage}>
        <ListChecks />
        Attributes
      </Button>
      <Button variant="outline" size="sm" onClick={onEdit}>
        <Pencil />
        Edit
      </Button>
      <RetireControl
        status={type.status}
        entityLabel="type"
        pending={changeStatus.isPending}
        mutate={(body) => changeStatus.mutateAsync(body)}
      />
    </div>
  );
}
