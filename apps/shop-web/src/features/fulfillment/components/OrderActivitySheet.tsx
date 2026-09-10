import { useQuery } from "@tanstack/react-query"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from "@effy/design-system/ui"

import { cn } from "@/lib/utils"

import { formatWhen, type OrderActivityEntry } from "../orderConsole"
import { orderActivityQuery } from "../queries"

/**
 * The order's Activity sheet (057 A3) — the full history, moved OUT of the page body onto a
 * right-anchored sheet, exactly as product detail's change log was.
 *
 * ⚠ WHY A SHEET. An order's log is open-ended: every pick tap, shortfall, state change, note, tag
 * change, refund, collection and arrival. A column in the page could only ever show the newest few; a
 * full-height sheet with its own scroll shows all of it and gives the page its width back.
 *
 * ⚠ READ ONLY WHEN OPEN. The detail read does not carry the log, so an operator who never opens the
 * sheet never pays for it; the query is `enabled` by `open`, and every write invalidates it.
 */
export function OrderActivitySheet({
  fulfillmentId,
  orderNumber,
  open,
  onOpenChange,
}: {
  fulfillmentId: string
  orderNumber: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const log = useQuery({ ...orderActivityQuery(fulfillmentId), enabled: open })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 rounded-none sm:max-w-[440px]">
        <SheetHeader className="border-border gap-1 border-b px-5 py-4 pr-12">
          <SheetTitle className="text-[15.5px] tracking-[-.015em]">Activity</SheetTitle>
          <SheetDescription className="text-[13px] leading-[1.55]">
            Everything that has happened to <span className="font-mono">{orderNumber}</span>, newest
            first.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {log.isPending ? (
            <div className="grid gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : log.isError ? (
            <p className="text-muted-foreground text-[13px]">The activity couldn&apos;t be loaded.</p>
          ) : log.data.entries.length === 0 ? (
            <p className="text-muted-foreground text-[13px]">Nothing recorded yet.</p>
          ) : (
            <ol className="grid">
              {log.data.entries.map((e, i) => (
                <ActivityEntry key={e.id} entry={e} last={i === log.data.entries.length - 1} />
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * One entry: a status dot on a rail, what happened, and "<when> · <who>".
 *
 * ⚠ THE DOT IS MONOCHROME. The mockup colours it green / amber / red by kind; amber is a third UI hue
 * and `--success` may not carry meaning beside text (Principle V). A decision-bearing entry — a
 * shortfall, money, can't-supply, a reversal — gets the full foreground; routine progress the muted
 * tone. The title always says which, so the dot is never the only thing telling them apart.
 */
function ActivityEntry({ entry, last }: { entry: OrderActivityEntry; last: boolean }) {
  const when = formatWhen(entry.at)
  return (
    <li className="grid grid-cols-[14px_1fr] gap-3">
      <div className="flex flex-col items-center">
        <span
          aria-hidden="true"
          className={cn(
            "mt-[6px] size-[7px] shrink-0 rounded-full",
            entry.tone === "strong" ? "bg-foreground" : "bg-muted-foreground/60",
          )}
        />
        {!last ? <span aria-hidden="true" className="bg-border w-px flex-1" /> : null}
      </div>
      <div className="grid gap-0.5 pb-4">
        <span
          className={cn(
            "text-[13.5px] leading-[1.5] text-pretty",
            entry.tone === "strong" ? "font-semibold" : "font-medium",
          )}
        >
          {entry.title}
        </span>
        <span className="text-muted-foreground text-[12px]">
          {entry.actorLabel ? `${when} · ${entry.actorLabel}` : when}
        </span>
      </div>
    </li>
  )
}
