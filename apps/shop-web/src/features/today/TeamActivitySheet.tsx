import { useQuery } from "@tanstack/react-query"

import type { TeamActivityEntryDTO } from "@effy/shared-types"
import { cn } from "@effy/design-system"
import { Skeleton } from "@effy/design-system/ui"
import { ResponsiveSheet } from "@effy/web-kit/patterns"
import { Check, CircleAlert, Dot } from "lucide-react"

import { relativeTime } from "./model"
import { teamActivityQuery } from "./queries"

export function TeamActivitySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const activity = useQuery({ ...teamActivityQuery, enabled: open })
  const now = Date.now()

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Team activity"
      description="Everything the team has done, newest first."
    >
      {activity.isPending ? (
        <div className="grid gap-4" aria-busy="true" aria-label="Loading team activity">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-5 rounded-full" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : activity.data && activity.data.entries.length > 0 ? (
        <ul className="ef-tl">
          {activity.data.entries.map((entry) => {
            const Mark = entry.tone === "problem" ? CircleAlert : entry.tone === "done" ? Check : Dot
            return (
              <li key={entry.id} className="ef-tl__item">
                <span
                  aria-hidden="true"
                  className={cn(
                    "ef-tl__mark",
                    entry.tone === "problem" && "ef-tl__mark--problem",
                    entry.tone === "done" && "ef-tl__mark--done",
                  )}
                >
                  <Mark />
                </span>
                <span className="min-w-0">
                  <span className="ef-tl__title block text-pretty">{describe(entry)}</span>
                  <span className="ef-tl__body block">
                    {relativeTime(entry.at, now)} · {who(entry.actor)}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="py-6 text-muted-foreground">Nothing has been recorded in the last two weeks.</p>
      )}
    </ResponsiveSheet>
  )
}

function who(actor: TeamActivityEntryDTO["actor"]): string {
  if (actor.kind === "staff") return actor.name
  if (actor.kind === "former_staff") return "A former team member"
  return "Effy"
}

const STATE_WORDS: Record<string, string> = {
  received: "opened",
  picking: "started picking",
  ready_for_pickup: "finished picking",
  collected: "handed over",
  delivered: "delivered",
  unfulfillable: "marked can't supply on",
  withdrawn: "withdrew",
}

function describe(entry: TeamActivityEntryDTO): string {
  const a = entry.action
  switch (a.kind) {
    case "state_changed":
      return `${STATE_WORDS[a.to] ?? "updated"} ${a.orderNumber}`
    case "item_gathered":
      return `picked ${a.quantity} × ${a.productName} on ${a.orderNumber}`
    case "item_unavailable":
      return `marked ${a.quantity} × ${a.productName} unavailable on ${a.orderNumber}`
    case "item_restored":
      return `restored ${a.productName} on ${a.orderNumber}`
    case "note_added":
      return `added a note to ${a.orderNumber}`
    case "tags_changed":
      return `changed the tags on ${a.orderNumber}`
    case "stock_changed":
      return `${a.delta > 0 ? "added" : "removed"} ${Math.abs(a.delta)} × ${a.productName} (${a.reason.replace(/_/g, " ")})`
    case "refund_issued":
      return `issued a refund of ${a.amount} on ${a.orderNumber}`
  }
}
