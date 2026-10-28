import { useEffect, useRef } from "react"

import { useQuery } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
import { History } from "lucide-react"

import { STOCK_MOVEMENT_REASONS, type StockMovementDTO } from "@effy/shared-types"
import {
  DataTable,
  defineListSearch,
  Facet,
  listQueryOptions,
  searchFilter,
  useListState,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"

import { actorLabel, formatDelta, reasonLabel, REASON_WORDS } from "./stockMovementText"
import { STOCK_ROOT } from "./stockQueries"
import { fetchMovementPage } from "./stockRepo"

/** A size's stock movements in the address (103), prefixed beside the page's `size`. Mirrors `MOVEMENT_LIST_SPEC`. */
export const movementsList = defineListSearch({
  id: "stock-movements",
  mode: "keyset",
  sorts: ["at"] as const,
  defaultSort: "at",
  sortDir: { at: "desc" },
  filters: { reason: searchFilter.oneOf(STOCK_MOVEMENT_REASONS) },
  prefix: "mv",
})

const columns: EffyColumnDef<StockMovementDTO>[] = [
  {
    id: "when",
    header: "When",
    cell: ({ row }) => <span className="whitespace-nowrap">{formatWhen(row.original.createdAt)}</span>,
    meta: { label: "When", phone: "primary" },
  },
  {
    id: "change",
    header: "Change",
    cell: ({ row }) => formatDelta(row.original.quantityDelta),
    meta: { label: "Change", align: "numeric", phone: "trail" },
  },
  {
    id: "count",
    header: "Count",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.quantityBefore} → {row.original.quantityAfter}
      </span>
    ),
    meta: { label: "Count", align: "numeric", priority: 2 },
  },
  { id: "reason", header: "Reason", cell: ({ row }) => reasonLabel(row.original), meta: { label: "Reason", phone: "badge" } },
  { id: "by", header: "By", cell: ({ row }) => actorLabel(row.original), meta: { label: "By", priority: 2 } },
]

/** Every change to one size's count, newest first, by cursor: the history is append-only and has no end. */
export function StockHistory({ variantId }: { variantId: string }) {
  const state = useListState(movementsList, useSearch({ strict: false }))
  const input = {
    key: [...STOCK_ROOT, "variant", variantId, "movements"] as const,
    list: movementsList,
    view: state.view,
    cursor: state.cursor,
    fetch: (qs: URLSearchParams, signal: AbortSignal) => fetchMovementPage(variantId, qs, signal),
  }
  const query = useQuery(listQueryOptions(input))

  // Another size is another history: start it at its first page.
  const shown = useRef(variantId)
  const { goTo, view } = state
  useEffect(() => {
    if (shown.current === variantId) return
    shown.current = variantId
    if (view.page > 1) goTo(1)
  }, [variantId, goTo, view.page])

  return (
    <DataTable
      app="shop-web"
      label="Stock movements"
      list={movementsList}
      state={state}
      columns={columns}
      query={query}
      empty={{
        icon: History,
        title: "No stock changes recorded yet",
        description: "Every change to the count appears here, with who made it and why.",
      }}
      toolbar={
        <Facet
          label="Reason"
          anyLabel="Any reason"
          value={state.view.filters.reason ?? null}
          onChange={(v) => state.setFilter("reason", v ?? undefined)}
          options={STOCK_MOVEMENT_REASONS.map((r) => ({ value: r, label: REASON_WORDS[r] }))}
        />
      }
    />
  )
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}
