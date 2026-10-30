import { useState } from "react"

import { asapSentence, courierEstimateSentence } from "@effy/shared-types"

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

  // The page says where to move it (its section head, More, the action bar); this holds the dialogs and the facts.
  return (
    <div className="grid gap-4">
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
  )
}
