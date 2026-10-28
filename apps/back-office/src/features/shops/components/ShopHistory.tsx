import { useQuery } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
import { History } from "lucide-react"

import { DataTable, listQueryOptions, useListState, type EffyColumnDef } from "@effy/web-kit/data-table"
import { Panel } from "@effy/web-kit/patterns"
import { moment } from "@/lib/format"

import { shopHistoryList } from "../list"
import type { AuditEntry } from "../model"
import { SHOPS_ROOT } from "../queries"
import { fetchShopHistoryPage } from "../repo"

function actionWords(action: string): string {
  const words = action
    .replace(/^shop\./, "")
    .replace(/[._]/g, " ")
    .trim()
  return words ? words[0]!.toUpperCase() + words.slice(1) : action
}

const columns: EffyColumnDef<AuditEntry>[] = [
  { id: "what", header: "What", cell: ({ row }) => actionWords(row.original.action), meta: { label: "What", identifying: true, phone: "primary" } },
  {
    id: "on",
    header: "On",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.targetType}
        {row.original.targetId ? ` · ${row.original.targetId}` : ""}
      </span>
    ),
    meta: { label: "On", priority: 3, phone: "hide" },
  },
  { id: "who", header: "Who", cell: ({ row }) => <span className="font-mono text-xs">{row.original.actorSub}</span>, meta: { label: "Who", priority: 2 } },
  {
    id: "when",
    header: "When",
    cell: ({ row }) => <span className="text-muted-foreground">{moment(row.original.createdAt)}</span>,
    meta: { label: "When", phone: "trail" },
  },
]

/** Every change to the shop and its roster, newest first (103: a keyset list on the shop's page). */
export function ShopHistory({ shopId }: { shopId: string }) {
  const state = useListState(shopHistoryList, useSearch({ strict: false }))
  const input = {
    key: [...SHOPS_ROOT, "history", shopId] as const,
    list: shopHistoryList,
    view: state.view,
    cursor: state.cursor,
    fetch: (qs: URLSearchParams, signal: AbortSignal) => fetchShopHistoryPage(shopId, qs, signal),
  }
  const query = useQuery(listQueryOptions(input))
  return (
    <Panel title="Activity" description="Every change to this shop and its roster, Melbourne time." flush>
      <DataTable
        app="back-office"
        label="Shop activity"
        list={shopHistoryList}
        state={state}
        columns={columns}
        query={query}
        empty={{ icon: History, title: "No history yet" }}
      />
    </Panel>
  )
}
