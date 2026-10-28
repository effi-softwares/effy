import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
import { Download, Ticket } from "lucide-react"

import { Button, Input, Label } from "@effy/design-system/ui"

import type { AdminPromotionCodeDTO } from "@effy/shared-types"
import { DataTable, Facet, listQueryOptions, SearchBox, useListState, type EffyColumnDef } from "@effy/web-kit/data-table"
import { Panel, StatusWord } from "@effy/web-kit/patterns"

import { promotionMutationError } from "../errorText"
import { codesList } from "../list"
import { PROMO_ROOT, useGenerateCodes } from "../queries"
import { exportCodes, fetchCodePage } from "../repo"

const STATE = {
  unused: { word: "Unused", tone: "quiet" },
  held: { word: "In a checkout", tone: "info" },
  used: { word: "Used", tone: "done" },
} as const

const CODE_COLUMNS: EffyColumnDef<AdminPromotionCodeDTO>[] = [
  { id: "code", header: "Code", cell: ({ row }) => row.original.code, meta: { label: "Code", identifying: true, phone: "primary", align: "mono", sortKey: "code" } },
  {
    id: "state",
    header: "State",
    cell: ({ row }) => <StatusWord tone={STATE[row.original.state].tone}>{STATE[row.original.state].word}</StatusWord>,
    meta: { label: "State", phone: "badge" },
  },
]

export function CodesPanel({ promotionId, canManage }: { promotionId: string; canManage: boolean }) {
  const state = useListState(codesList, useSearch({ strict: false }))
  const input = {
    key: [...PROMO_ROOT, "codes", promotionId] as const,
    list: codesList,
    view: state.view,
    fetch: (qs: URLSearchParams, signal: AbortSignal) => fetchCodePage(promotionId, qs, signal),
  }
  const list = useQuery(listQueryOptions(input))
  const gen = useGenerateCodes(promotionId)
  const [count, setCount] = useState("100")
  const [prefix, setPrefix] = useState("")
  const [note, setNote] = useState<string | null>(null)

  const download = async () => {
    const { csv } = await exportCodes(promotionId)
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const a = Object.assign(document.createElement("a"), { href: url, download: "promotion-codes.csv" })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Panel
      title="Single-use codes"
      description="Each works once, for anyone who has it."
      actions={
        list.data && list.data.total > 0 ? (
          <Button size="sm" variant="outline" onClick={() => void download()}>
            <Download aria-hidden="true" />
            Download CSV
          </Button>
        ) : null
      }
      flush
    >
      {canManage ? (
        <div className="flex flex-wrap items-end gap-3 border-b border-border px-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="codes-count">How many</Label>
            <Input
              id="codes-count"
              type="number"
              min={1}
              max={10000}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="w-28"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="codes-prefix">Prefix (optional)</Label>
            <Input
              id="codes-prefix"
              value={prefix}
              maxLength={8}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              className="w-32 font-mono"
              placeholder="NEWS"
            />
          </div>
          <Button
            size="sm"
            disabled={gen.isPending || !(Number(count) >= 1)}
            onClick={() =>
              gen.mutate(
                { count: Number(count), prefix: prefix || null },
                {
                  onSuccess: (r) => setNote(`${r.created} codes created.`),
                  onError: (e) => setNote(promotionMutationError(e)),
                },
              )
            }
          >
            Generate codes
          </Button>
          {note ? (
            <span role="status" className="mt-0.5 block text-sm text-muted-foreground">
              {note}
            </span>
          ) : null}
        </div>
      ) : null}
      <DataTable
        app="back-office"
        label="Single-use codes"
        list={codesList}
        state={state}
        columns={CODE_COLUMNS}
        query={list}
        queryInput={input}
        rowId={(c) => c.code}
        empty={{ icon: Ticket, title: "No single-use codes yet" }}
        toolbar={
          <>
            <Facet
              label="State"
              anyLabel="Any state"
              value={state.view.filters.state ?? null}
              onChange={(v) => state.setFilter("state", v ?? undefined)}
              options={(Object.keys(STATE) as (keyof typeof STATE)[]).map((k) => ({ value: k, label: STATE[k].word }))}
            />
            <SearchBox label="Search codes" placeholder="Code…" value={state.draftQ} onChange={state.setQ} />
          </>
        }
      />
    </Panel>
  )
}
