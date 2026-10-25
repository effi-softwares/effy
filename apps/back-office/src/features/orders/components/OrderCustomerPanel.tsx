import { Link } from "@tanstack/react-router"

import { Button } from "@effy/design-system/ui"
import { Panel } from "@effy/web-kit/patterns"

import { initialsOf } from "@/components/shell/identity"
import { OrderCustomerPoints } from "@/features/customers/components/OrderCustomerPoints"

import type { OrderDetail } from "../model"

export function OrderCustomerPanel({ order }: { order: OrderDetail }) {
  return (
    <Panel
      title="Customer"
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/customers/$customerId" params={{ customerId: order.customerId }}>
            View customer
          </Link>
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="avatar avatar--lg avatar--blue" aria-hidden="true">
            {initialsOf(order.customerName ?? order.customerEmail)}
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold">{order.customerName ?? order.customerEmail}</div>
            {order.customerName ? <div className="ef-sub truncate">{order.customerEmail}</div> : null}
          </div>
        </div>
        <OrderCustomerPoints
          customerId={order.customerId}
          customerName={order.customerName ?? order.customerEmail}
          orderId={order.id}
          orderNumber={order.orderNumber}
          layout="block"
        />
      </div>
    </Panel>
  )
}
