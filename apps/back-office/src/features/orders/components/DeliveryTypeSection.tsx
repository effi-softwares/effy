import { useState } from "react"

import { asapSentence, courierEstimateSentence } from "@effy/shared-types"
import { Button, Card } from "@effy/design-system/ui"
import { CalendarClock, Route, Truck } from "lucide-react"

import { ChangeDeliveryWindowDialog } from "./ChangeDeliveryWindowDialog"
import { CourierCollection } from "./CourierCollection"
import { DeliverByEffyDialog } from "./DeliverByEffyDialog"
import { SendByCourierDialog } from "./SendByCourierDialog"
import { DELIVERY_REASON_LABEL, deliveryTypeText, PROMISE_LABEL, type OrderDetail } from "../model"

export type DeliveryMove = "courier" | "effy" | "retime"

export function DeliveryTypeSection({
  order,
  canChangeCollection = false,
  canMove = false,
  moving: movingProp,
  onMovingChange,
  children,
}: {
  order: OrderDetail
  canChangeCollection?: boolean
  canMove?: boolean
  moving?: DeliveryMove | null
  onMovingChange?: (m: DeliveryMove | null) => void
  children?: React.ReactNode
}) {
  const [ownMoving, setOwnMoving] = useState<DeliveryMove | null>(null)
  const moving = movingProp !== undefined ? movingProp : ownMoving
  const setMoving = onMovingChange ?? setOwnMoving

  return (
    <>
      <section className="min-w-0" aria-labelledby="delivery-h">
        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-5 py-4 max-md:px-4">
            <h2
              id="delivery-h"
              className="flex items-center gap-2 leading-6 font-semibold [&_svg]:size-4 [&_svg]:text-muted-foreground"
            >
              Delivery
            </h2>
          </div>
          <div className="px-5 py-4 max-md:px-4 space-y-4">
            <dl className="ef-dl ef-dl--tight">
              <div className="ef-dl__row">
                <dt>Delivered by</dt>
                <dd className="font-semibold">{deliveryTypeText(order.deliveryType)}</dd>
              </div>
              {order.deliveryTypeReason ? (
                <div className="ef-dl__row">
                  <dt>Why</dt>
                  <dd>{DELIVERY_REASON_LABEL[order.deliveryTypeReason]}</dd>
                </div>
              ) : null}
              {order.courierEstimate ? (
                <div className="ef-dl__row">
                  <dt>Customer was told</dt>
                  <dd>{courierEstimateSentence(order.courierEstimate)}</dd>
                </div>
              ) : null}
              {order.promise ? (
                <div className="ef-dl__row">
                  <dt>Sold as</dt>
                  <dd>{PROMISE_LABEL[order.promise]}</dd>
                </div>
              ) : null}
              {order.promise === "asap" && order.asapEstimate ? (
                <div className="ef-dl__row">
                  <dt>Customer was told</dt>
                  <dd>{asapSentence(order.asapEstimate)}</dd>
                </div>
              ) : null}
            </dl>

            {children}

            {order.deliveryType && canMove && order.status === "paid" ? (
              <div className="grid gap-2">
                {order.deliveryType === "effy" ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setMoving("retime")}>
                      <CalendarClock aria-hidden="true" />
                      Change day or time…
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setMoving("courier")}>
                      <Truck aria-hidden="true" />
                      Send by courier…
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setMoving("effy")}>
                    <Route aria-hidden="true" />
                    Deliver by Effy…
                  </Button>
                )}
              </div>
            ) : null}
            {canMove ? (
              <>
                <SendByCourierDialog
                  orderId={order.id}
                  open={moving === "courier"}
                  onOpenChange={(o) => setMoving(o ? "courier" : null)}
                />
                <DeliverByEffyDialog
                  orderId={order.id}
                  open={moving === "effy"}
                  onOpenChange={(o) => setMoving(o ? "effy" : null)}
                />
                <ChangeDeliveryWindowDialog
                  orderId={order.id}
                  open={moving === "retime"}
                  onOpenChange={(o) => setMoving(o ? "retime" : null)}
                />
              </>
            ) : null}
            <CourierCollection order={order} canChange={canChangeCollection} />
          </div>
        </Card>
      </section>
    </>
  )
}
