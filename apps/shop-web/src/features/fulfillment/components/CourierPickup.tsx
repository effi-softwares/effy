import type { CourierPickupDTO } from "@effy/shared-types"
import { Truck } from "lucide-react"

import { Button } from "@effy/design-system/ui"

import { canHandOver, courierPickupLine, pickupWhen } from "../courierPickup"
import { useCourierHandover } from "../queries"

export function CourierPickup({
  fulfillmentId,
  status,
  pickup,
}: {
  fulfillmentId: string
  status: string
  pickup: CourierPickupDTO
}) {
  const handOver = useCourierHandover(fulfillmentId)
  const when = pickupWhen(pickup)
  const service = [pickup.courierName, pickup.serviceName].filter(Boolean).join(" · ")

  return (
    <div className="grid gap-3 px-5 py-4 max-md:px-4" data-testid="courier-pickup">
      <p className="flex items-center gap-2 font-medium">
        <Truck aria-hidden="true" className="size-4 text-muted-foreground" />
        {courierPickupLine(pickup)}
      </p>
      <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-[max-content_1fr]">
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
            <dd className="ef-code">{pickup.reference}</dd>
          </>
        ) : null}
        {pickup.labelUrl ? (
          <>
            <dt className="text-muted-foreground">Label</dt>
            <dd>
              <a
                className="font-medium text-primary hover:underline"
                href={pickup.labelUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open label to print
              </a>
            </dd>
          </>
        ) : null}
      </dl>
      {pickup.state === "arranging" || pickup.state === "cancelled" ? (
        <p className="text-sm text-muted-foreground">
          Pack it and mark it ready as usual. Effy will book the pickup and the time will show here.
        </p>
      ) : null}
      {canHandOver(pickup, status) ? (
        <div>
          <Button className="w-full" disabled={handOver.isPending} onClick={() => handOver.mutate()}>
            Handed over to courier
          </Button>
        </div>
      ) : pickup.state === "booked" && status !== "ready_for_pickup" ? (
        <p className="text-sm text-muted-foreground">Mark it ready before the courier arrives.</p>
      ) : null}
    </div>
  )
}
