import { BellRing, Clock, Timer } from "lucide-react"

import { cn } from "@/lib/utils"

import { formatPlacedShort, type OrderRow } from "../orderConsole"

const FINISHED = new Set<OrderRow["status"]>(["collected", "delivered", "unfulfillable", "withdrawn"])

function waitText(placedAt: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - new Date(placedAt).getTime()) / 60_000))
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)} h ${mins % 60} m`
}

export function OrderWait({ row, now }: { row: Pick<OrderRow, "placedAt" | "status" | "atRisk">; now: number }) {
  const placed = new Date(row.placedAt).getTime()
  if (FINISHED.has(row.status) || !Number.isFinite(placed)) {
    return <time dateTime={row.placedAt}>{formatPlacedShort(row.placedAt)}</time>
  }
  const fresh = now - placed < 15 * 60_000
  return (
    <time
      dateTime={row.placedAt}
      className={cn("ef-st", row.atRisk ? "ef-st--problem" : fresh ? "ef-st--info" : "ef-st--muted")}
    >
      {row.atRisk ? (
        <Clock aria-hidden="true" />
      ) : fresh ? (
        <BellRing aria-hidden="true" />
      ) : (
        <Timer aria-hidden="true" />
      )}
      {waitText(row.placedAt, now)}
    </time>
  )
}
