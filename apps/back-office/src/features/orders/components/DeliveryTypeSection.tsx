import { useState } from "react";

import { courierEstimateSentence } from "@effy/shared-types";
import { Button } from "@effy/design-system/ui";

import { CourierCollection } from "./CourierCollection";
import { DeliverByEffyDialog } from "./DeliverByEffyDialog";
import { DeliveryHistory } from "./DeliveryHistory";
import { SendByCourierDialog } from "./SendByCourierDialog";
import { DELIVERY_REASON_LABEL, deliveryChangeText, deliveryTypeText, type OrderDetail } from "../model";

/**
 * Who delivers this order, why, and every change since (079 US7).
 *
 * ⚠ A LIST OF FACTS AND A LIST OF CHANGES, not a card and not a timeline widget — the question staff
 * are asked is "why did this go by courier?", and the answer is one line. The history is rows of
 * WHEN / WHAT / WHY / WHO like the order's own history below it.
 *
 * ⚠ NOTHING IS SHOWN FOR AN ORDER PLACED BEFORE ORDERS HAD A DELIVERY TYPE except that plain fact.
 * Its packages still say who took them (the Packages section); a type and a history are not invented
 * for it.
 */
export function DeliveryTypeSection({ order, formatDateTime, canChangeCollection = false, canMove = false }: {
  order: OrderDetail;
  formatDateTime: (iso: string | null) => string;
  /** 080 — admin/manager: switch how a courier order's parcels reach the courier. */
  canChangeCollection?: boolean;
  /** 081 — admin/manager: move the order to courier delivery, or back to Effy. The server enforces it too. */
  canMove?: boolean;
}) {
  const [moving, setMoving] = useState<"courier" | "effy" | null>(null);
  if (!order.deliveryType) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Delivery type</h2>
        <p className="text-sm text-muted-foreground">
          This order was placed before orders had a delivery type. Each package below says who delivered it.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Delivery type</h2>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">Delivered by</dt>
        <dd className="font-medium">{deliveryTypeText(order.deliveryType)}</dd>
        {order.deliveryTypeReason ? (
          <>
            <dt className="text-muted-foreground">Why</dt>
            <dd>{DELIVERY_REASON_LABEL[order.deliveryTypeReason]}</dd>
          </>
        ) : null}
        {order.courierEstimate ? (
          <>
            <dt className="text-muted-foreground">Customer was told</dt>
            {/* The estimate AS SOLD — the order's own copy, in the sentence the customer read. */}
            <dd>{courierEstimateSentence(order.courierEstimate)}</dd>
          </>
        ) : null}
      </dl>

      {/* 081 — an emergency move, and back. Offered to admins and managers; the preview says if it may not. */}
      {canMove && (order.status === "paid") ? (
        <div className="flex flex-wrap gap-2">
          {order.deliveryType === "effy" ? (
            <Button variant="outline" size="sm" onClick={() => setMoving("courier")}>Send by courier…</Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setMoving("effy")}>Deliver by Effy…</Button>
          )}
        </div>
      ) : null}
      {canMove ? (
        <>
          <SendByCourierDialog orderId={order.id} open={moving === "courier"} onOpenChange={(o) => setMoving(o ? "courier" : null)} />
          <DeliverByEffyDialog orderId={order.id} open={moving === "effy"} onOpenChange={(o) => setMoving(o ? "effy" : null)} />
        </>
      ) : null}
      <DeliveryHistory moves={order.deliveryMoves ?? []} formatDateTime={(iso) => formatDateTime(iso)} />

      {/* 080 US3 — only on a courier order. */}
      <CourierCollection order={order} canChange={canChangeCollection} formatDateTime={(iso) => formatDateTime(iso)} />

      {order.deliveryTypeHistory.length > 0 ? (
        <table className="w-full text-sm" aria-label="Delivery type history">
          <tbody className="divide-y">
            {order.deliveryTypeHistory.map((c, i) => (
              <tr key={`${c.at}-${i}`}>
                <td className="w-48 py-2 align-top tabular-nums text-muted-foreground">{formatDateTime(c.at)}</td>
                <td className="py-2 align-top">
                  {deliveryChangeText(c)}
                  <span className="block text-muted-foreground">
                    {DELIVERY_REASON_LABEL[c.reason]}
                    {c.note ? ` — ${c.note}` : ""}
                  </span>
                </td>
                <td className="w-56 py-2 align-top text-muted-foreground">
                  {c.actor.kind === "staff" ? <span className="font-mono text-xs">{c.actor.sub}</span> : "Decided at checkout"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
