import type { VehicleHolding } from "@effy/shared-types"

import { formatDateTime, formatOdometer } from "../model"

export function HoldingHistory({ holdings }: { holdings: VehicleHolding[] }) {
  if (holdings.length === 0) {
    return <p className="text-sm text-muted-foreground">This vehicle has never been issued to anybody.</p>
  }

  return (
    <ul className="divide-y border-y">
      {holdings.map((h) => (
        <li key={h.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3 text-sm">
          <span className="font-medium">{h.driverName}</span>
          <span className="text-muted-foreground">
            {formatDateTime(h.startedAt)} → {h.endedAt ? formatDateTime(h.endedAt) : "still out"}
          </span>
          <span className="tabular-nums text-muted-foreground">
            {formatOdometer(h.odometerStartKm)} → {formatOdometer(h.odometerEndKm)}
          </span>
          {h.note ? <span className="text-muted-foreground">{h.note}</span> : null}
        </li>
      ))}
    </ul>
  )
}
