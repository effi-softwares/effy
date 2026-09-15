import { useQuery } from "@tanstack/react-query"

import type { TeamActivityEntryDTO } from "@effy/shared-types"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from "@effy/design-system/ui"

import { relativeTime } from "./model"
import { teamActivityQuery } from "./queries"

/**
 * "Team activity" — the accountability the platform already records, in one place (058, US5).
 *
 * ⚠ IT READS EXISTING AUDIT TRAILS; IT WRITES NOTHING. Fulfilment events, stock movements and
 * shop-issued refunds are already recorded per order and per product — what was missing was a way to
 * see them as a shift rather than as scattered rows on individual screens.
 *
 * ⚠ THE TONE IS A DOT (Principle V). The imported design coloured the text; a problem shown only in
 * red is invisible to a colour-blind operator and to anyone printing this.
 */
export function TeamActivitySheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const activity = useQuery({ ...teamActivityQuery, enabled: open })
  const now = Date.now()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 rounded-none sm:max-w-[440px]">
        <SheetHeader className="border-border gap-1 border-b px-5 pt-[18px] pb-3.5 pr-12">
          <SheetTitle className="text-[15.5px] tracking-[-.015em]">Team activity</SheetTitle>
          <SheetDescription className="text-[13px] leading-[1.55]">
            Everything the team has done, newest first.
          </SheetDescription>
        </SheetHeader>

        <div className="overflow-y-auto px-5 py-2">
          {activity.isPending ? (
            <div className="grid gap-2 py-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : activity.data && activity.data.entries.length > 0 ? (
            <ul className="grid gap-0.5">
              {activity.data.entries.map((entry) => (
                <li key={entry.id} className="flex items-start gap-[11px] border-t py-3">
                  <span
                    aria-hidden="true"
                    className={
                      entry.tone === "problem"
                        ? "bg-destructive mt-[7px] size-[5px] shrink-0 rounded-full"
                        : entry.tone === "done"
                          ? "bg-success mt-[7px] size-[5px] shrink-0 rounded-full"
                          : "bg-muted-foreground mt-[7px] size-[5px] shrink-0 rounded-full"
                    }
                  />
                  <span className="grid min-w-0 flex-1 gap-[3px]">
                    <span className="text-[13.5px] leading-[1.5] text-pretty">
                      {describe(entry)}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {relativeTime(entry.at, now)} · {who(entry.actor)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground py-6 text-sm">
              Nothing has been recorded in the last two weeks.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** Who acted — never blank, and never an Effy employee's name (FR-014). */
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

/** One sentence per entry, in the operator's words rather than the database's. */
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
