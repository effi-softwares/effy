import { useState } from "react"

import { asapSentence, courierEstimateSentence } from "@effy/shared-types"
import { Button } from "@effy/design-system/ui"
import { CalendarClock, Route, Truck } from "lucide-react"

import { ChangeDeliveryWindowDialog } from "./ChangeDeliveryWindowDialog"
import { CourierCollection } from "./CourierCollection"
import { DeliverByEffyDialog } from "./DeliverByEffyDialog"
import { DeliveryHistory } from "./DeliveryHistory"
import { SendByCourierDialog } from "./SendByCourierDialog"
import { DELIVERY_REASON_LABEL, deliveryChangeText, deliveryTypeText, PROMISE_LABEL, type OrderDetail } from "../model"

export type DeliveryMove = "courier" | "effy" | "retime"

export function DeliveryTypeSection({
  order,
  formatDateTime,
  canChangeCollection = false,
  canMove = false,
  moving: movingProp,
  onMovingChange,
  children,
}: {
  order: OrderDetail
  formatDateTime: (iso: string | null) => string
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
      <section className="bo-panel" aria-labelledby="delivery-h">
        <div className="bo-panel__head">
          <h2 id="delivery-h" className="bo-panel__title">
            Delivery
          </h2>
        </div>
        <div className="bo-panel__body space-y-4">
          <dl className="bo-dl bo-dl--tight">
            <div className="bo-dl__row">
              <dt>Delivered by</dt>
              <dd className="font-semibold">{deliveryTypeText(order.deliveryType)}</dd>
            </div>
            {order.deliveryTypeReason ? (
              <div className="bo-dl__row">
                <dt>Why</dt>
                <dd>{DELIVERY_REASON_LABEL[order.deliveryTypeReason]}</dd>
              </div>
            ) : null}
            {order.courierEstimate ? (
              <div className="bo-dl__row">
                <dt>Customer was told</dt>
                <dd>{courierEstimateSentence(order.courierEstimate)}</dd>
              </div>
            ) : null}
            {order.promise ? (
              <div className="bo-dl__row">
                <dt>Sold as</dt>
                <dd>{PROMISE_LABEL[order.promise]}</dd>
              </div>
            ) : null}
            {order.promise === "asap" && order.asapEstimate ? (
              <div className="bo-dl__row">
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
          <DeliveryHistory moves={order.deliveryMoves ?? []} formatDateTime={(iso) => formatDateTime(iso)} />

          <CourierCollection
            order={order}
            canChange={canChangeCollection}
            formatDateTime={(iso) => formatDateTime(iso)}
          />
        </div>
      </section>

      {order.deliveryTypeHistory.length > 0 ? (
        <section className="bo-panel" aria-labelledby="delivery-type-h">
          <div className="bo-panel__head">
            <h2 id="delivery-type-h" className="bo-panel__title">
              Delivery type history
            </h2>
          </div>
          <table className="bo-table bo-table--compact bo-table--plain" aria-label="Delivery type history">
            <tbody>
              {order.deliveryTypeHistory.map((c, i) => (
                <tr key={`${c.at}-${i}`}>
                  <td>
                    {deliveryChangeText(c)}
                    <span className="bo-sub">
                      {DELIVERY_REASON_LABEL[c.reason]}
                      {c.note ? ` — ${c.note}` : ""}
                    </span>
                    <span className="bo-sub">
                      {c.actor.kind === "staff" ? (
                        <span className="bo-code">{c.actor.sub}</span>
                      ) : (
                        "Decided at checkout"
                      )}
                    </span>
                  </td>
                  <td className="is-num text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(c.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  )
}
