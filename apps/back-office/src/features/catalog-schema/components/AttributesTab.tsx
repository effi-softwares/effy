import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus } from "lucide-react";

import { Button } from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import type { AttributeDefinition } from "../model";
import { attributesQuery, useChangeAttributeStatus } from "../queries";
import { AttributeDialog } from "./AttributeDialog";
import { RetireControl } from "./RetireControl";
import { SchemaStatusBadge } from "./StatusBadge";
import { StatusFilter, type StatusFilterValue } from "./StatusFilter";

// The Attributes tab: the reusable attribute library. Sectioned table (no cards); per-attribute
// edit and retire/activate gated by `canManage`.
export function AttributesTab({ canManage }: { canManage: boolean }) {
  const { data, error, isPending, isError, refetch } = useQuery(attributesQuery());
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AttributeDefinition | null>(null);

  const rows = useMemo(
    () => (data ?? []).filter((a) => statusFilter === "all" || a.status === statusFilter),
    [data, statusFilter],
  );

  const columns = useMemo<ColumnDef<AttributeDefinition>[]>(
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
      { accessorKey: "dataType", header: "Type" },
      {
        accessorKey: "unit",
        header: "Unit",
        cell: ({ row }) => row.original.unit ?? "—",
      },
      {
        id: "values",
        header: "Values",
        cell: ({ row }) =>
          row.original.allowedValues.length > 0 ? (
            <span className="tabular-nums">{row.original.allowedValues.length}</span>
          ) : (
            "—"
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
              cell: ({ row }: { row: { original: AttributeDefinition } }) => (
                <AttributeActions
                  attribute={row.original}
                  onEdit={() => setEditing(row.original)}
                />
              ),
            } satisfies ColumnDef<AttributeDefinition>,
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
            New attribute
          </Button>
        ) : null}
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <DataTable columns={columns} data={rows} emptyMessage="No attributes yet." />
      )}

      {canManage ? (
        <>
          <AttributeDialog open={createOpen} onOpenChange={setCreateOpen} />
          {editing ? (
            <AttributeDialog
              attribute={editing}
              open
              onOpenChange={(o) => !o && setEditing(null)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function AttributeActions({
  attribute,
  onEdit,
}: {
  attribute: AttributeDefinition;
  onEdit: () => void;
}) {
  const changeStatus = useChangeAttributeStatus(attribute.id);
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" onClick={onEdit}>
        <Pencil />
        Edit
      </Button>
      <RetireControl
        status={attribute.status}
        entityLabel="attribute"
        pending={changeStatus.isPending}
        mutate={(body) => changeStatus.mutateAsync(body)}
      />
    </div>
  );
}
