import { type AdminDeliveryMoveDTO, formatArrival } from "@effy/shared-types"

import { deliveryTypeText } from "../model"
import { Table, TableBody, TableCell, TableRow } from "@effy/design-system/ui"

const COMPENSATION_TEXT: Record<AdminDeliveryMoveDTO["compensation"], string> = {
  points_difference: "Points for the difference",
  free_delivery_points: "Free delivery, as points",
  free_delivery_refund: "Free delivery, back to the card",
  refund_difference: "The difference, back to the card",
  none: "Nothing",
}

export function compensationSummary(m: AdminDeliveryMoveDTO): string {
  if (m.to === "effy") return "No money moved"
  if (m.compensation === "none") return `Nothing given${m.compensationNote ? ` — ${m.compensationNote}` : ""}`
  const what = m.points !== null ? `${m.points} points ($${m.amount})` : `$${m.amount}`
  return `${COMPENSATION_TEXT[m.compensation]}: ${what}${m.refundStatus ? ` · refund ${m.refundStatus}` : ""}`
}

export function DeliveryHistory({
  moves,
  formatDateTime,
}: {
  moves: AdminDeliveryMoveDTO[]
  formatDateTime: (iso: string) => string
}) {
  if (moves.length === 0) return null
  return (
    <Table className="w-full text-sm" aria-label="Moves by back-office">
      <TableBody className="divide-y">
        {moves.map((m) => (
          <TableRow key={m.id}>
            <TableCell className="w-48 py-2 align-top tabular-nums text-muted-foreground">
              {formatDateTime(m.at)}
            </TableCell>
            <TableCell className="py-2 align-top">
              <span className="font-medium">
                {m.to === "courier" ? "Moved to courier delivery" : `Moved back: ${deliveryTypeText("effy")}`}
              </span>
              <span className="block">{m.reason}</span>
              {m.window ? (
                <span className="block text-muted-foreground">
                  {m.to === "courier" ? "Window given up: " : "Window: "}
                  {formatArrival(
                    { promisedFrom: null, promisedTo: null, windowStart: m.window.start, windowEnd: m.window.end },
                    new Date(),
                  )}
                </span>
              ) : null}
              {m.to === "courier" ? (
                <span className="block text-muted-foreground tabular-nums">
                  Paid ${m.paidDeliveryAmount} · courier ${m.courierFeeAmount} · difference ${m.differenceAmount}
                  {m.courier ? ` · ${m.courier.courierName} · ${m.courier.serviceName}` : ""}
                </span>
              ) : null}
              <span className="block">{compensationSummary(m)}</span>
            </TableCell>
            <TableCell className="w-56 py-2 align-top text-muted-foreground">{m.actor.name}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
