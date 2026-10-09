import type { CourierPickupDTO } from "@effy/shared-types"
import { Button } from "@effy/design-system/ui"

import { canHandOver, courierPickupLine, pickupWhen } from "../courierPickup"
import { useCourierHandover } from "../queries"

/**
 * 080 US2 — a courier collects this parcel from the shop: who comes, when, the label to attach, and
 * "Handed over to courier" once they have it.
 *
 * ⚠ ROWS, NOT A CARD (Principle V), in the "Customer and delivery" section. The shop prepares and
 * marks the parcel ready exactly as before; the handover is the only new step.
 */
export function CourierPickup({ fulfillmentId, status, pickup }: { fulfillmentId: string; status: string; pickup: CourierPickupDTO }) {
  const handOver = useCourierHandover(fulfillmentId)
  const when = pickupWhen(pickup)
  const service = [pickup.courierName, pickup.serviceName].filter(Boolean).join(" · ")

  return (
    <div className="border-border grid gap-2 border-b py-3.5" data-testid="courier-pickup">
      <p className="text-[13.5px] font-medium">{courierPickupLine(pickup)}</p>
      <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-[max-content_1fr]">
        {service ? (
          <>
            <dt className="text-muted-foreground">Courier</dt>
            <dd>{service}</dd>
          </>
        ) : null}
        {when ? (
          <>
            <dt className="text-muted-foreground">Pickup</dt>
            <dd className="tabular-nums">{when}</dd>
          </>
        ) : null}
        {pickup.reference ? (
          <>
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="font-mono">{pickup.reference}</dd>
          </>
        ) : null}
        {pickup.labelUrl ? (
          <>
            <dt className="text-muted-foreground">Label</dt>
            <dd>
              <a className="text-primary hover:underline" href={pickup.labelUrl} target="_blank" rel="noreferrer">
                Open label to print
              </a>
            </dd>
          </>
        ) : null}
      </dl>
      {pickup.state === "arranging" || pickup.state === "cancelled" ? (
        <p className="text-muted-foreground text-[12.5px]">
          Pack it and mark it ready as usual. Effy will book the pickup and the time will show here.
        </p>
      ) : null}
      {canHandOver(pickup, status) ? (
        <div>
          <Button disabled={handOver.isPending} onClick={() => handOver.mutate()}>
            Handed over to courier
          </Button>
        </div>
      ) : pickup.state === "booked" && status !== "ready_for_pickup" ? (
        <p className="text-muted-foreground text-[12.5px]">Mark it ready before the courier arrives.</p>
      ) : null}
    </div>
  )
}
