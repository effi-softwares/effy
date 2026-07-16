import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus } from "lucide-react";

import { Button } from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import type { Category } from "../model";
import { categoriesQuery, useChangeCategoryStatus } from "../queries";
import { CategoryDialog } from "./CategoryDialog";
import { RetireControl } from "./RetireControl";
import { SchemaStatusBadge } from "./StatusBadge";
import { StatusFilter, type StatusFilterValue } from "./StatusFilter";

// The Categories tab: the flat taxonomy (parentId-linked; a full tree UI is out of US1 scope).
// Sectioned table (no cards); per-category edit and retire/activate gated by `canManage`. The parent
// select in the dialog needs every node, so the loaded list is passed straight through.
export function CategoriesTab({ canManage }: { canManage: boolean }) {
  const { data, error, isPending, isError, refetch } = useQuery(categoriesQuery());
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const all = data ?? [];
  const nameById = useMemo(() => new Map(all.map((c) => [c.id, c.name])), [all]);
  const rows = useMemo(
    () => all.filter((c) => statusFilter === "all" || c.status === statusFilter),
    [all, statusFilter],
  );

  const columns = useMemo<ColumnDef<Category>[]>(
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
        id: "parent",
        header: "Parent",
        cell: ({ row }) =>
          row.original.parentId ? (nameById.get(row.original.parentId) ?? "—") : "—",
      },
      {
        accessorKey: "displayOrder",
        header: "Order",
        cell: ({ row }) => <span className="tabular-nums">{row.original.displayOrder}</span>,
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
              cell: ({ row }: { row: { original: Category } }) => (
                <CategoryActions category={row.original} onEdit={() => setEditing(row.original)} />
              ),
            } satisfies ColumnDef<Category>,
          ]
        : []),
    ],
    [canManage, nameById],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        {canManage ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus />
            New category
          </Button>
        ) : null}
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <DataTable columns={columns} data={rows} emptyMessage="No categories yet." />
      )}

      {canManage ? (
        <>
          <CategoryDialog categories={all} open={createOpen} onOpenChange={setCreateOpen} />
          {editing ? (
            <CategoryDialog
              category={editing}
              categories={all}
              open
              onOpenChange={(o) => !o && setEditing(null)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function CategoryActions({ category, onEdit }: { category: Category; onEdit: () => void }) {
  const changeStatus = useChangeCategoryStatus(category.id);
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" onClick={onEdit}>
        <Pencil />
        Edit
      </Button>
      <RetireControl
        status={category.status}
        entityLabel="category"
        pending={changeStatus.isPending}
        mutate={(body) => changeStatus.mutateAsync(body)}
      />
    </div>
  );
}
