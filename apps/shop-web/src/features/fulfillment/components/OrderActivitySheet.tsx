import { useQuery } from "@tanstack/react-query"

import { Check, CircleAlert, Dot } from "lucide-react"

import { Skeleton } from "@effy/design-system/ui"
import { ResponsiveSheet, Timeline, TimelineItem } from "@effy/web-kit/patterns"

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
                <Skeleton className="h-4 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : log.isError ? (
        <p className="text-sm text-muted-foreground">The activity couldn&apos;t be loaded.</p>
      ) : log.data.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <Timeline>
          {log.data.entries.map((e) => (
            <TimelineItem
              key={e.id}
              icon={e.tone === "negative" ? <CircleAlert /> : e.tone === "strong" ? <Check /> : <Dot />}
              tone={e.tone === "negative" ? "problem" : e.tone === "strong" ? "primary" : "default"}
              title={e.title}
            >
              {e.actorLabel ? `${e.actorLabel} · ${formatWhen(e.at)}` : formatWhen(e.at)}
            </TimelineItem>
          ))}
        </Timeline>
      )}
    </ResponsiveSheet>
  )
}
