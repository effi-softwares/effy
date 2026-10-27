import { History } from "lucide-react"

import { PRODUCT_HISTORY_WORDS, type ProductHistoryEntryDTO } from "@effy/shared-types"
import { EmptyState, Panel } from "@effy/web-kit/patterns"

import { moment } from "@/lib/format"

/** Effy's decisions on a product, newest first: who, when and why (102 FR-008). */
export function HistoryList({ entries }: { entries: readonly ProductHistoryEntryDTO[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nothing recorded yet"
        description="Effy's decisions on this product appear here."
      />
    )
  }
  return (
    <Panel title="History" flush>
      <ol className="divide-y">
        {entries.map((e, i) => (
          <li key={`${e.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{PRODUCT_HISTORY_WORDS[e.action]}</p>
              {e.note ? <p className="text-sm whitespace-pre-line text-muted-foreground">{e.note}</p> : null}
            </div>
            <p className="ef-sub whitespace-nowrap">
              {moment(e.at)}
              {e.actor ? ` · ${e.actor}` : ""}
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  )
}
