import {
  formatDeliveryWindow,
  formatMoment,
  windowStateAt,
  type DeliveryWindow,
  type DeliveryWindowState,
  type ExclusionReasonDTO,
  type UnassignedWorkDTO,
} from "@effy/shared-types"

export const REASON_TEXT: Record<ExclusionReasonDTO, string> = {
  not_on_duty: "Not on duty",
  not_employable: "Stood down or no longer employed",
  licence_expired: "Licence expired",
  no_vehicle: "Holding no vehicle",
  not_cleared: "Not cleared for this work",
  no_refrigeration: "Vehicle cannot carry these goods",
  over_capacity: "Round too heavy for the vehicle",
  cannot_meet_deadline: "Cannot finish in time",
  vehicle_check_due: "Vehicle not checked today",
  vehicle_unsafe: "Vehicle found unsafe — clear it on Exceptions",
}

export function describeReasons(reasons: ExclusionReasonDTO[]): string {
  if (reasons.length === 0) return "No driver is cleared for this work at all"
  return reasons.map((r) => REASON_TEXT[r]).join(" · ")
}

export function roundLabel(kind: string): string {
  return kind === "collection" ? "Collection" : "Delivery"
}

export function windowNoteFor(
  stop: { status: string; deliveryWindow?: DeliveryWindow | null },
  now: Date,
): { text: string; state: DeliveryWindowState | "finished" } | null {
  if (!stop.deliveryWindow) return null
  const text = formatDeliveryWindow(stop.deliveryWindow)
  if (stop.status === "done" || stop.status === "skipped") return { text, state: "finished" }
  return { text, state: windowStateAt(now, stop.deliveryWindow) }
}

export const WINDOW_STATE_LABEL: Record<DeliveryWindowState | "finished", string> = {
  upcoming: "",
  due: "Due now",
  late: "Late",
  finished: "",
}

export function roundOpenState(
  round: { opensAt: string | null; status: string },
  now: Date,
): { open: boolean; text: string } {
  if (round.status === "completed" || round.status === "cancelled") return { open: true, text: "" }
  if (round.opensAt === null || new Date(round.opensAt).getTime() <= now.getTime()) {
    return { open: true, text: "Open" }
  }
  return { open: false, text: `Opens ${formatMoment(round.opensAt, now)}` }
}

export function momentText(at: string, now: Date): string {
  return formatMoment(at, now)
}

export function waitingFor(item: Pick<UnassignedWorkDTO, "stage" | "targetAt">, now: Date): string {
  if (item.stage === "delivery") {
    return item.targetAt ? `At the hub · deliver by ${formatMoment(item.targetAt, now)}` : "At the hub"
  }
  return item.targetAt
    ? `At the shop · next collection ${formatMoment(item.targetAt, now)}`
    : "At the shop · no collection run is scheduled"
}
