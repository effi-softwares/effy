import { useQuery } from "@tanstack/react-query"

import { Check, CircleAlert, Dot } from "lucide-react"

import { Skeleton } from "@effy/design-system/ui"
import { ResponsiveSheet } from "@effy/web-kit/patterns"

import { cn } from "@/lib/utils"

import { formatWhen } from "../orderConsole"
import { orderActivityQuery } from "../queries"

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
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Activity"
      description="Everything that has happened on this order."
    >
      {log.isPending ? (
        <div className="grid gap-4" aria-busy="true" aria-label="Loading activity">
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
      ) : log.isError ? (
        <p className="text-muted-foreground">The activity couldn&apos;t be loaded.</p>
      ) : log.data.entries.length === 0 ? (
        <p className="text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <ol className="bo-tl">
          {log.data.entries.map((e) => (
            <li key={e.id} className="bo-tl__item">
              <span
                aria-hidden="true"
                className={cn(
                  "bo-tl__mark",
                  e.tone === "negative" && "bo-tl__mark--problem",
                  e.tone === "strong" && "bo-tl__mark--primary",
                )}
              >
                {e.tone === "negative" ? <CircleAlert /> : e.tone === "strong" ? <Check /> : <Dot />}
              </span>
              <span className="min-w-0">
                <span className="bo-tl__title block text-pretty">{e.title}</span>
                <span className="bo-tl__body block">
                  {e.actorLabel ? `${e.actorLabel} · ${formatWhen(e.at)}` : formatWhen(e.at)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </ResponsiveSheet>
  )
}
