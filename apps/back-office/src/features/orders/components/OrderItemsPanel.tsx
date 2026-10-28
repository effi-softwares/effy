import { Package } from "lucide-react"

import { Panel } from "@effy/web-kit/patterns"

import { money } from "@/lib/format"

import type { OrderDetail } from "../model"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui"

export function OrderItemsPanel({ order }: { order: OrderDetail }) {
  return (
    <Panel
      title={
        <>
          Items{" "}
          <span className="font-normal text-muted-foreground">· {order.items.reduce((n, i) => n + i.quantity, 0)}</span>
        </>
      }
      flush
    >
      <div className="min-w-0">
        <Table className="ef-rtable [&_td]:py-2">
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead numeric>Qty</TableHead>
              <TableHead numeric>Unit</TableHead>
              <TableHead numeric>Line</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.map((i) => (
              <TableRow key={i.orderItemId}>
                <TableCell data-m="primary">
                  <div className="flex items-center gap-3">
                    <span
                      className="grid flex-none place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground [&_svg]:size-4 size-9"
                      aria-hidden="true"
                    >
                      <Package />
                    </span>
                    <span>
                      {i.productName}
                      {i.variantLabel ? <span className="text-muted-foreground"> — {i.variantLabel}</span> : null}
                      {i.variantCode || i.sku ? (
                        <span className="block font-mono text-xs text-muted-foreground">
                          {[i.variantCode, i.sku].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </TableCell>
                <TableCell numeric data-m="meta" data-label="Qty">
                  {i.quantity}
                </TableCell>
                <TableCell numeric data-m="hide" className="text-muted-foreground">
                  {money(i.unitPriceAmount, order.currency)}
                </TableCell>
                <TableCell numeric data-m="trail">
                  {money(i.lineSubtotalAmount, order.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Panel>
  )
}
