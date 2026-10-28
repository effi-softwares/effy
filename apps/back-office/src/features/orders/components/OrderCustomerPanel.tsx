import { Link } from "@tanstack/react-router"

import { Avatar, AvatarFallback, Button } from "@effy/design-system/ui"
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
          <Avatar aria-hidden="true" className="size-12">
            <AvatarFallback className="text-base bg-primary-muted text-primary">
              {initialsOf(order.customerName ?? order.customerEmail)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate font-semibold">{order.customerName ?? order.customerEmail}</div>
            {order.customerName ? (
              <div className="mt-0.5 block text-sm text-muted-foreground truncate">{order.customerEmail}</div>
            ) : null}
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
