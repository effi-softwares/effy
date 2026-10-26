import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"

import { Button, Input } from "@effy/design-system/ui"
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
      <div className="ef-toolbar flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          aria-label="Search attributes"
          placeholder="Search attributes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div role="group" aria-label="Status" className="ef-seg">
          {(["active", "retired", "all"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              className={view === v ? "is-active" : undefined}
              onClick={() => setView(v)}
            >
              {v === "active" ? "Active" : v === "retired" ? "Retired" : "All"}
            </button>
          ))}
        </div>
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
        <div className="ef-table-wrap">
          <div className="ef-table-scroll">
            <table className="ef-table ef-rtable">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Input</th>
                  <th>Unit</th>
                  <th>Filter</th>
                  <th>Shown to customers</th>
                  <th>Per size</th>
                  <th className="text-right">Used by</th>
                  <th>Status</th>
                  {canManage ? <th className="sr-only">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td data-m="title">
                      <span className="font-medium">{a.name}</span>
                      {a.variantOption ? (
                        <span className="block text-xs text-muted-foreground">Can be a variant option</span>
                      ) : null}
                    </td>
                    <td>{INPUT_TYPE_WORDS[a.inputType]}</td>
                    <td>{a.unitFamily ? `${UNIT_FAMILIES[a.unitFamily].label} (${a.units.join(", ")})` : "—"}</td>
                    <td>{a.filterable ? "Yes" : "—"}</td>
                    <td>{a.customerVisible ? "Yes" : "Internal"}</td>
                    <td>{a.variesByVariant ? "Yes" : "—"}</td>
                    <td className="text-right tabular-nums" data-m="trail">
                      {a.usage.categories} categories · {a.usage.products} products
                    </td>
                    <td>
                      {a.status === "active" ? (
                        <span className="ef-st ef-st--done">Active</span>
                      ) : (
                        <span className="ef-st ef-st--muted">Retired</span>
                      )}
                    </td>
                    {canManage ? (
                      <td>
                        <RowActions attribute={a} onEdit={() => setEditing(a)} />
                      </td>
                    ) : null}
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 9 : 8} className="text-center text-muted-foreground">
                      No attributes match.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
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
