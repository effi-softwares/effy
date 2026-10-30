import { CircleCheck, Info } from "lucide-react"

import { asapSentence, courierEstimateSentence, DELIVERY_TYPE_WORDS } from "@effy/shared-types"
import { Card } from "@effy/design-system/ui"

import { cn } from "@/lib/utils"

import { aud, CUSTOMER_STAGES, promiseTextFor, type OrderDetail } from "../model"

/**
 * The customer's own order screen, as they see it now: one order, its progress in their four steps, when it comes
 * and who brings it. Nothing on it names a shop or says how many pack it — the customer never sees that.
 */
export function CustomerOrderPreview({ order }: { order: OrderDetail }) {
  const at = Math.max(
    0,
    CUSTOMER_STAGES.findIndex((s) => s.stage === order.stage),
  )
  const finished = order.stage === "delivered"
  const step = CUSTOMER_STAGES[at]!
  const units = order.items.reduce((n, i) => n + i.quantity, 0)
  const first = order.packages[0]
  const when =
    order.deliveryType === "courier"
      ? order.courierEstimate
        ? courierEstimateSentence(order.courierEstimate)
        : null
      : order.promise === "asap"
        ? order.asapEstimate
          ? asapSentence(order.asapEstimate)
          : null
        : first
          ? promiseTextFor(first)
          : null

  return (
    <div className="grid gap-3">
      <Card className="gap-0 py-0" aria-label="The customer's order screen">
        <div className="border-b px-4 py-3.5">
          <p className="text-xs text-muted-foreground">Order {order.orderNumber}</p>
          <p className="mt-0.5 text-base font-semibold">{finished ? step.note : step.label}</p>
        </div>
        <ol aria-label="Order progress" className="m-0 grid list-none grid-cols-4 gap-1 px-4 pt-3.5 pb-1">
          {CUSTOMER_STAGES.map((s, i) => (
            <li key={s.stage} className="grid gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "h-1 rounded-full",
                  i < at || (finished && i === at) ? "bg-brand-fill" : i === at ? "bg-primary-fill" : "bg-muted",
                )}
              />
              <span className={cn("truncate text-[11px]", i === at ? "font-semibold" : "text-muted-foreground")}>
                {s.label}
              </span>
            </li>
          ))}
        </ol>
        <dl className="m-0 grid gap-2.5 px-4 pt-2.5 pb-4 text-[13px] [&_div]:flex [&_div]:justify-between [&_div]:gap-3 [&_dt]:text-muted-foreground [&_dd]:m-0 [&_dd]:text-right">
          {when ? (
            <div>
              <dt>{order.deliveryType === "courier" ? "Estimate" : "When"}</dt>
              <dd className="font-medium">{when}</dd>
            </div>
          ) : null}
          <div>
            <dt>Delivery</dt>
            <dd
              className={
                order.deliveryType === "effy" ? "inline-flex items-center gap-1.5 font-semibold text-brand" : ""
              }
            >
              {order.deliveryType === "effy" ? <CircleCheck aria-hidden="true" className="size-3.5" /> : null}
              {DELIVERY_TYPE_WORDS[order.deliveryType]}
            </dd>
          </div>
          <div>
            <dt>{units === 1 ? "1 item" : `${units} items`}</dt>
            <dd className="font-semibold tabular-nums">{aud(order.grandTotalAmount, order.currency)}</dd>
          </div>
        </dl>
      </Card>
      <p className="flex gap-1.5 text-xs text-muted-foreground">
        <Info aria-hidden="true" className="mt-px size-3.5 flex-none" />
        One order, one arrival — the customer never sees that{" "}
        {order.packages.length === 1 ? "a shop packs it" : `${order.packages.length} shops pack it`}.
      </p>
    </div>
  )
}
