import { CircleCheck, History, Package, Truck, Undo2, Warehouse } from "lucide-react"

import { Panel } from "@effy/web-kit/patterns"

import { moment } from "@/lib/format"

import type { OrderHistoryEntry } from "../model"

export function OrderHistoryPanel({ history }: { history: OrderHistoryEntry[] }) {
  return (
    <Panel title="History" icon={<History aria-hidden="true" />}>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing has happened to this order yet.</p>
      ) : (
        <ol className="ef-tl">
          {history.map((h, i) => (
            <HistoryItem key={`${h.at}-${i}`} entry={h} />
          ))}
        </ol>
      )}
    </Panel>
  )
}

const HISTORY_ICON = { fulfillment: Package, driver: Truck, handoff: Warehouse, arrival: CircleCheck } as const

function HistoryItem({ entry: h }: { entry: OrderHistoryEntry }) {
  const Icon = HISTORY_ICON[h.kind] ?? Undo2
  const tone =
    h.kind === "arrival"
      ? "ef-tl__mark--done"
      : h.kind === "driver" || h.kind === "handoff"
        ? "ef-tl__mark--primary"
        : ""
  return (
    <li className="ef-tl__item">
      <span className={`ef-tl__mark ${tone}`} aria-hidden="true">
        <Icon />
      </span>
      <div>
        <div className="ef-tl__title">{h.summary}</div>
        {h.actorSub ? (
          <div className="ef-tl__body">
            <span className="ef-code">{h.actorSub}</span>
          </div>
        ) : null}
      </div>
      <span className="ef-tl__time">{moment(h.at)}</span>
    </li>
  )
}
