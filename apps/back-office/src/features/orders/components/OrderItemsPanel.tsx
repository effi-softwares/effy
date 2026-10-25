import { Package } from "lucide-react"

import { Panel } from "@effy/web-kit/patterns"

import { money } from "@/lib/format"

import type { OrderDetail } from "../model"

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
      <div className="ef-table-scroll">
        <table className="ef-table ef-rtable ef-table--compact ef-table--plain">
          <thead>
            <tr>
              <th>Product</th>
              <th className="is-num">Qty</th>
              <th className="is-num">Unit</th>
              <th className="is-num">Line</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.orderItemId}>
                <td data-m="primary">
                  <div className="flex items-center gap-3">
                    <span className="ef-img size-9" aria-hidden="true">
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
                </td>
                <td data-m="meta" data-label="Qty" className="is-num">
                  {i.quantity}
                </td>
                <td data-m="hide" className="is-num is-muted">
                  {money(i.unitPriceAmount, order.currency)}
                </td>
                <td data-m="trail" className="is-num">
                  {money(i.lineSubtotalAmount, order.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
