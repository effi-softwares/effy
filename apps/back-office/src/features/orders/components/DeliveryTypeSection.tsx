import { useState } from "react"

import { CalendarClock, Info, MessageSquare, Truck } from "lucide-react"

import { asapSentence, courierEstimateSentence } from "@effy/shared-types"
import { InspectorRows } from "@effy/web-kit/patterns"

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
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h3 className="text-[13px] font-semibold">Sold as</h3>
        <InspectorRows
          rows={[
            {
              key: "by",
              icon: Truck,
              label: "Delivered by",
              value: deliveryTypeText(order.deliveryType),
            },
            ...(order.promise
              ? [{ key: "promise", icon: CalendarClock, label: "Sold as", value: PROMISE_LABEL[order.promise] }]
              : []),
            ...(order.courierEstimate
              ? [
                  {
                    key: "told",
                    icon: MessageSquare,
                    label: "Customer was told",
                    value: courierEstimateSentence(order.courierEstimate),
                  },
                ]
              : []),
            ...(order.promise === "asap" && order.asapEstimate
              ? [
                  {
                    key: "asap",
                    icon: MessageSquare,
                    label: "Customer was told",
                    value: asapSentence(order.asapEstimate),
                  },
                ]
              : []),
            ...(order.deliveryTypeReason
              ? [{ key: "why", icon: Info, label: "Why", value: DELIVERY_REASON_LABEL[order.deliveryTypeReason] }]
              : []),
          ]}
        />
      </div>

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
