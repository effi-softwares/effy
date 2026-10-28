import { CircleCheck, History, Package, Truck, Undo2, Warehouse } from "lucide-react"

import { Panel, Timeline, TimelineItem } from "@effy/web-kit/patterns"

import { moment } from "@/lib/format"

import type { OrderHistoryEntry } from "../model"

export function OrderHistoryPanel({ history }: { history: OrderHistoryEntry[] }) {
  return (
    <Panel title="History" icon={<History aria-hidden="true" />}>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing has happened to this order yet.</p>
      ) : (
        <Timeline>
          {history.map((h, i) => (
            <HistoryItem key={`${h.at}-${i}`} entry={h} />
          ))}
        </Timeline>
      )}
    </Panel>
  )
}

const HISTORY_ICON = { fulfillment: Package, driver: Truck, handoff: Warehouse, arrival: CircleCheck } as const

function HistoryItem({ entry: h }: { entry: OrderHistoryEntry }) {
  const Icon = HISTORY_ICON[h.kind] ?? Undo2
  const tone = h.kind === "arrival" ? "done" : h.kind === "driver" || h.kind === "handoff" ? "primary" : "default"
  return (
    <TimelineItem icon={<Icon />} tone={tone} title={h.summary} time={moment(h.at)}>
      {h.actorSub ? <span className="font-mono">{h.actorSub}</span> : null}
    </TimelineItem>
  )
}
