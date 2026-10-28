import { Package } from "lucide-react"

import { StaticTable, type EffyColumnDef } from "@effy/web-kit/data-table"
import { Panel } from "@effy/web-kit/patterns"

import { money } from "@/lib/format"

import type { OrderDetail } from "../model"

type Item = OrderDetail["items"][number]

function columnsFor(currency: string): EffyColumnDef<Item>[] {
  return [
    {
      id: "product",
      header: "Product",
      cell: ({ row }) => {
        const i = row.original
        return (
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
        )
      },
      meta: { label: "Product", identifying: true, phone: "primary" },
    },
    { id: "qty", header: "Qty", cell: ({ row }) => row.original.quantity, meta: { label: "Qty", align: "numeric" } },
    {
      id: "unit",
      header: "Unit",
      cell: ({ row }) => <span className="text-muted-foreground">{money(row.original.unitPriceAmount, currency)}</span>,
      meta: { label: "Unit", align: "numeric", phone: "hide" },
    },
    {
      id: "line",
      header: "Line",
      cell: ({ row }) => money(row.original.lineSubtotalAmount, currency),
      meta: { label: "Line", align: "numeric", phone: "trail" },
    },
  ]
}

/** The order's lines: every one is on the order, so a bounded table with no pager (103 FR-021). */
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
      <StaticTable
        label="Items"
        columns={columnsFor(order.currency)}
        rows={order.items}
        getRowId={(i) => i.orderItemId}
        framed={false}
      />
    </Panel>
  )
}
