import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"

import { Badge, Button, ToggleGroup, ToggleGroupItem } from "@effy/design-system/ui"
import { CAPPED_SET_LIMIT, INPUT_TYPE_WORDS, listFullSentence, UNIT_FAMILIES, type AttributeDTO } from "@effy/shared-types"
import { ErrorState } from "@effy/web-kit/console"
import { SearchBox, StaticTable, type EffyColumnDef } from "@effy/web-kit/data-table"

import { AttributeDialog } from "./AttributeDialog"
import { taxonomyErrorText } from "./errorText"
import { attributesQuery, useSetAttributeStatus } from "./queries"

type StatusView = "active" | "retired" | "all"

/**
 * The attribute library: each attribute defined once, reused by any category, one filter everywhere. A set
 * staff make and the category editor's picker reads whole, so it is shown whole (103 FR-024): searched and
 * sorted here, capped on the server.
 */
export function AttributeLibrary({ canManage }: { canManage: boolean }) {
  const { data, error, isPending, isError, refetch } = useQuery(attributesQuery())
  const [q, setQ] = useState("")
  const [view, setView] = useState<StatusView>("active")
  const [editing, setEditing] = useState<AttributeDTO | "new" | null>(null)

  const rows = useMemo(() => {
    const w = q.trim().toLowerCase()
    return (data ?? []).filter((a) => (view === "all" || a.status === view) && (!w || a.name.toLowerCase().includes(w)))
  }, [data, q, view])

  const columns = useMemo<EffyColumnDef<AttributeDTO>[]>(
    () => [
      {
        id: "name",
        accessorFn: (a) => a.name.toLowerCase(),
        header: "Name",
        cell: ({ row }) => (
          <>
            <span className="font-medium">{row.original.name}</span>
            {row.original.variantOption ? (
              <span className="block text-xs text-muted-foreground">Can be a variant option</span>
            ) : null}
          </>
        ),
        meta: { label: "Name", identifying: true, phone: "primary" },
      },
      {
        id: "input",
        accessorFn: (a) => INPUT_TYPE_WORDS[a.inputType],
        header: "Input",
        cell: ({ row }) => INPUT_TYPE_WORDS[row.original.inputType],
        meta: { label: "Input" },
      },
      {
        id: "unit",
        header: "Unit",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.unitFamily ? `${UNIT_FAMILIES[row.original.unitFamily].label} (${row.original.units.join(", ")})` : "—",
        meta: { label: "Unit", priority: 2 },
      },
      {
        id: "filter",
        header: "Filter",
        enableSorting: false,
        cell: ({ row }) => (row.original.filterable ? "Yes" : "—"),
        meta: { label: "Filter", priority: 2 },
      },
      {
        id: "visible",
        header: "Shown to customers",
        enableSorting: false,
        cell: ({ row }) => (row.original.customerVisible ? "Yes" : "Internal"),
        meta: { label: "Shown to customers", priority: 2 },
      },
      {
        id: "perSize",
        header: "Per size",
        enableSorting: false,
        cell: ({ row }) => (row.original.variesByVariant ? "Yes" : "—"),
        meta: { label: "Per size", priority: 3 },
      },
      {
        id: "usedBy",
        accessorFn: (a) => a.usage.products,
        sortDescFirst: true,
        header: "Used by",
        cell: ({ row }) => `${row.original.usage.categories} categories · ${row.original.usage.products} products`,
        meta: { label: "Used by", align: "numeric", phone: "trail" },
      },
      {
        id: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.status === "active" ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Retired</Badge>,
        meta: { label: "Status", phone: "badge" },
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: () => <span className="sr-only">Actions</span>,
              enableSorting: false,
              cell: ({ row }) => <RowActions attribute={row.original} onEdit={() => setEditing(row.original)} />,
              meta: { label: "Actions", phone: "full" },
            } satisfies EffyColumnDef<AttributeDTO>,
          ]
        : []),
    ],
    [canManage],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Status"
          value={view}
          onValueChange={(v) => v && setView(v as typeof view)}
        >
          {(["active", "retired", "all"] as const).map((v) => (
            <ToggleGroupItem key={v} value={v} className="px-3">
              {v === "active" ? "Active" : v === "retired" ? "Retired" : "All"}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {canManage ? (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus />
            New attribute
          </Button>
        ) : null}
        <SearchBox label="Search attributes" placeholder="Search attributes…" value={q} onChange={setQ} />
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <StaticTable label="Attribute library" columns={columns} rows={[]} getRowId={(a) => a.id} loading loadingRows={8} />
      ) : (
        <StaticTable
          label="Attribute library"
          columns={columns}
          rows={rows}
          getRowId={(a) => a.id}
          initialSort={{ id: "name" }}
          empty="No attributes match."
        />
      )}
      {(data?.length ?? 0) >= CAPPED_SET_LIMIT ? (
        <p className="text-sm text-muted-foreground">{listFullSentence(CAPPED_SET_LIMIT)}</p>
      ) : null}
      {editing ? (
        <AttributeDialog attribute={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  )
}

function RowActions({ attribute, onEdit }: { attribute: AttributeDTO; onEdit: () => void }) {
  const setStatus = useSetAttributeStatus()
  const [error, setError] = useState<string | null>(null)
  const next = attribute.status === "active" ? "retired" : "active"
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={setStatus.isPending || (next === "retired" && attribute.usage.products > 0)}
          title={next === "retired" && attribute.usage.products > 0 ? "Products use it" : undefined}
          onClick={() => {
            setError(null)
            setStatus.mutate({ id: attribute.id, status: next }, { onError: (err) => setError(taxonomyErrorText(err)) })
          }}
        >
          {next === "retired" ? "Retire" : "Restore"}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
