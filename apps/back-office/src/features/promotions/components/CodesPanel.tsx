import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Download } from "lucide-react"

import { Button, Input, Label } from "@effy/design-system/ui"

import { Panel, StatusWord, Pager } from "@effy/web-kit/patterns"

import { promotionMutationError } from "../errorText"
import { codesQuery, useGenerateCodes } from "../queries"
import { exportCodes } from "../repo"

const STATE = {
  unused: { word: "Unused", tone: "quiet" },
  held: { word: "In a checkout", tone: "info" },
  used: { word: "Used", tone: "done" },
} as const

export function CodesPanel({ promotionId, canManage }: { promotionId: string; canManage: boolean }) {
  const [page, setPage] = useState(1)
  const list = useQuery(codesQuery(promotionId, page))
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

  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1
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
            <span role="status" className="ef-sub">
              {note}
            </span>
          ) : null}
        </div>
      ) : null}
      {list.data && list.data.items.length > 0 ? (
        <>
          <ul className="divide-y divide-border">
            {list.data.items.map((c) => (
              <li key={c.code} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                <span className="ef-code">{c.code}</span>
                <StatusWord tone={STATE[c.state].tone}>{STATE[c.state].word}</StatusWord>
              </li>
            ))}
          </ul>
          <Pager
            summary={`${list.data.total} codes`}
            canBack={page > 1}
            canNext={page < pages}
            onBack={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
          />
        </>
      ) : (
        <p className="px-5 py-4 text-sm text-muted-foreground">No single-use codes yet.</p>
      )}
    </Panel>
  )
}
