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

import { formatWhen } from "../orderConsole"
import { orderActivityQuery } from "../queries"

/**
 * The order's Activity sheet (057 A3 revision 2) — the design's `orderActivity` side sheet: right-hand,
 * full height, ~440px, a close button in its header, no footer. Its body is the order's log only —
 * product stats and the product change log belong to product detail's own sheet and never appear here.
 *
 * ⚠ READ ONLY WHEN OPEN — the page does not pay for a history nobody asked to see; every write
 * invalidates it.
 */
export function OrderActivitySheet({
  fulfillmentId,
  open,
  onOpenChange,
}: {
  fulfillmentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const log = useQuery({ ...orderActivityQuery(fulfillmentId), enabled: open })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 rounded-none sm:max-w-[440px]">
        <SheetHeader className="border-border gap-1 border-b px-5 pt-[18px] pb-3.5 pr-12">
          <SheetTitle className="text-[15.5px] tracking-[-.015em]">Activity</SheetTitle>
          <SheetDescription className="text-[13px] leading-[1.55]">
            Everything that has happened on this order.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-[18px]">
          {log.isPending ? (
            <div className="grid gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : log.isError ? (
            <p className="text-muted-foreground text-[13px]">The activity couldn&apos;t be loaded.</p>
          ) : log.data.entries.length === 0 ? (
            <p className="text-muted-foreground text-[13px]">Nothing recorded yet.</p>
          ) : (
            <ol className="grid gap-0.5">
              {log.data.entries.map((e) => (
                <li key={e.id} className="border-border flex items-start gap-[11px] border-t py-[11px]">
                  {/* ⚠ The dot: the platform's error colour for something the customer will not get
                      (the design's destructive dot), the foreground for a decision, muted for routine
                      progress. No third hue — the title always says which. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-[7px] size-[5px] shrink-0 rounded-full",
                      e.tone === "negative" && "bg-destructive",
                      e.tone === "strong" && "bg-foreground",
                      e.tone === "quiet" && "bg-muted-foreground",
                    )}
                  />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-[13.5px] leading-[1.5] text-pretty">{e.title}</span>
                    <span className="text-muted-foreground text-[12px]">
                      {e.actorLabel ? `${e.actorLabel} · ${formatWhen(e.at)}` : formatWhen(e.at)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
