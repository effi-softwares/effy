import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"

import {
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
} from "@effy/design-system/ui"
import { INPUT_TYPE_WORDS, UNIT_FAMILIES, type AttributeDTO } from "@effy/shared-types"
import { ErrorState } from "@effy/web-kit/console"

import { AttributeDialog } from "./AttributeDialog"
import { taxonomyErrorText } from "./errorText"
import { attributesQuery, useSetAttributeStatus } from "./queries"

type StatusView = "active" | "retired" | "all"

/** The attribute library: each attribute defined once, reused by any category, one filter everywhere. */
export function AttributeLibrary({ canManage }: { canManage: boolean }) {
  const { data, error, isPending, isError, refetch } = useQuery(attributesQuery())
  const [q, setQ] = useState("")
  const [view, setView] = useState<StatusView>("active")
  const [editing, setEditing] = useState<AttributeDTO | "new" | null>(null)

  const rows = useMemo(() => {
    const w = q.trim().toLowerCase()
    return (data ?? []).filter((a) => (view === "all" || a.status === view) && (!w || a.name.toLowerCase().includes(w)))
  }, [data, q, view])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          aria-label="Search attributes"
          placeholder="Search attributes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
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
          <Button size="sm" className="ml-auto" onClick={() => setEditing("new")}>
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
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="min-w-0">
            <Table className="ef-rtable">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Input</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Filter</TableHead>
                  <TableHead>Shown to customers</TableHead>
                  <TableHead>Per size</TableHead>
                  <TableHead className="text-right">Used by</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage ? <TableHead className="sr-only">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell data-m="title">
                      <span className="font-medium">{a.name}</span>
                      {a.variantOption ? (
                        <span className="block text-xs text-muted-foreground">Can be a variant option</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{INPUT_TYPE_WORDS[a.inputType]}</TableCell>
                    <TableCell>
                      {a.unitFamily ? `${UNIT_FAMILIES[a.unitFamily].label} (${a.units.join(", ")})` : "—"}
                    </TableCell>
                    <TableCell>{a.filterable ? "Yes" : "—"}</TableCell>
                    <TableCell>{a.customerVisible ? "Yes" : "Internal"}</TableCell>
                    <TableCell>{a.variesByVariant ? "Yes" : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums" data-m="trail">
                      {a.usage.categories} categories · {a.usage.products} products
                    </TableCell>
                    <TableCell>
                      {a.status === "active" ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="muted">Retired</Badge>
                      )}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <RowActions attribute={a} onEdit={() => setEditing(a)} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canManage ? 9 : 8} className="text-center text-muted-foreground">
                      No attributes match.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
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
