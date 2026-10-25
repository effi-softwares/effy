import { CreditCard } from "lucide-react"

import { Badge } from "@effy/design-system/ui"
import { Panel } from "@effy/web-kit/patterns"

import { money } from "@/lib/format"

import { isPaid, type OrderDetail } from "../model"
import { FeeBreakdown } from "./FeeBreakdown"

export function OrderPaymentPanel({ order }: { order: OrderDetail }) {
  const paid = isPaid(order)
  return (
    <Panel
      title="Payment"
      icon={<CreditCard aria-hidden="true" />}
      actions={<Badge variant={paid ? "success" : "secondary"}>{paid ? "Paid" : order.paymentStatus}</Badge>}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <dl className="ef-dl">
          <MoneyRow label="Items" value={money(order.itemSubtotalAmount, order.currency)} />
          {Number(order.discountAmount) > 0 ? (
            <MoneyRow
              label={`Discount${order.promoCode ? ` (${order.promoCode})` : ""}`}
              value={`−${money(order.discountAmount, order.currency)}`}
            />
          ) : null}
          <MoneyRow label="Delivery" value={money(order.deliveryFeeAmount, order.currency)} />
          <MoneyRow strong label="Total" value={money(order.grandTotalAmount, order.currency)} />
          {order.paymentSplit ? (
            <>
              <MoneyRow
                label="Paid with points"
                value={`${order.paymentSplit.pointsUsed.toLocaleString("en-AU")} points · ${money(order.paymentSplit.pointsAmount, order.currency)}${
                  order.paymentSplit.pointsReturned > 0
                    ? ` (${order.paymentSplit.pointsReturned.toLocaleString("en-AU")} returned)`
                    : ""
                }`}
              />
              <MoneyRow label="Paid by card" value={money(order.paymentSplit.cardAmount, order.currency)} />
            </>
          ) : null}
          {order.paymentMethod ? (
            <MoneyRow
              label="Method"
              value={
                [order.paymentMethod.brand, order.paymentMethod.last4 ? `ending ${order.paymentMethod.last4}` : null]
                  .filter(Boolean)
                  .join(" ") || order.paymentMethod.type
              }
            />
          ) : null}
        </dl>
        <FeeBreakdown breakdown={order.deliveryFeeBreakdown} />
      </div>
    </Panel>
  )
}

function MoneyRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="ef-dl__row">
      <dt className={strong ? "font-semibold text-foreground!" : undefined}>{label}</dt>
      <dd className={`text-right tabular-nums${strong ? " font-semibold" : ""}`}>{value}</dd>
    </div>
  )
}
