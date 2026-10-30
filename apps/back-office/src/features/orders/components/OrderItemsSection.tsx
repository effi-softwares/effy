import { useMemo } from "react"

import { ImageOff, Store } from "lucide-react"

import { Checkbox } from "@effy/design-system/ui"
import { StaticTable, type EffyColumnDef } from "@effy/web-kit/data-table"
import { PackageStatusPill } from "@effy/web-kit/console"

import { aud, type OrderDetail } from "../model"

type Item = OrderDetail["items"][number]

/** How many of a line can still be refunded (0 when none). */
export const refundableOf = (order: OrderDetail, id: string) =>
  order.refundableLines.find((l) => l.orderItemId === id)?.quantity ?? 0

function columnsFor(
  order: OrderDetail,
  selection: { selected: ReadonlySet<string>; onToggle: (id: string) => void } | null,
): EffyColumnDef<Item>[] {
  const c = order.currency
  return [
    ...(selection
      ? [
          {
            id: "select",
            header: () => <span className="sr-only">Select</span>,
            cell: ({ row }) => {
              const i = row.original
              const left = refundableOf(order, i.orderItemId)
              return (
                <Checkbox
                  aria-label={`Select ${i.productName}`}
                  checked={selection.selected.has(i.orderItemId)}
                  disabled={left === 0}
                  title={left === 0 ? "Nothing left to refund" : undefined}
                  onCheckedChange={() => selection.onToggle(i.orderItemId)}
                />
              )
            },
            meta: { label: "Select", phone: "hide" },
          } satisfies EffyColumnDef<Item>,
        ]
      : []),
    {
      id: "product",
      header: "Item",
      cell: ({ row }) => {
        const i = row.original
        return (
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-12 flex-none place-items-center overflow-hidden rounded-md border bg-muted text-muted-foreground [&_svg]:size-4"
            >
              {i.imageUrl ? <img src={i.imageUrl} alt="" className="size-full object-cover" /> : <ImageOff />}
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{i.productName}</span>
              <span className="block text-[13px] text-muted-foreground">
                {[i.variantLabel, i.variantCode, i.sku].filter(Boolean).join(" · ")}
              </span>
            </span>
          </div>
        )
      },
      meta: { label: "Item", identifying: true, phone: "primary" },
    },
    { id: "qty", header: "Qty", cell: ({ row }) => `×${row.original.quantity}`, meta: { label: "Qty", align: "numeric" } },
    {
      id: "unit",
      header: "Price",
      cell: ({ row }) => <span className="text-muted-foreground">{aud(row.original.unitPriceAmount, c)}</span>,
      meta: { label: "Price", align: "numeric", phone: "hide" },
    },
    {
      id: "line",
      header: "Total",
      cell: ({ row }) => <span className="font-medium">{aud(row.original.lineSubtotalAmount, c)}</span>,
      meta: { label: "Total", align: "numeric", phone: "trail" },
    },
  ]
}

/**
 * What the customer bought, at the price they paid, a table per shop that packs it (every line is on the order: a
 * bounded table, 103). Ticking lines offers to refund them from the action bar; the totals close it.
 */
export function OrderItemsSection({
  order,
  selection,
}: {
  order: OrderDetail
  selection: { selected: ReadonlySet<string>; onToggle: (id: string) => void } | null
}) {
  const c = order.currency
  // Kept between renders: rebuilt columns are new cell components, which would remount a checkbox mid-click.
  const selected = selection?.selected
  const toggle = selection?.onToggle
  const columns = useMemo(
    () => columnsFor(order, selected && toggle ? { selected, onToggle: toggle } : null),
    // `onToggle` writes through a state setter, so the first one stays right.
    [order, selected],
  )
  const shops = order.packages.length > 0 ? order.packages : null
  const discount = Number(order.discountAmount)
  return (
    <div className="grid gap-6">
      {(shops ?? [null]).map((p) => {
        const rows = p ? order.items.filter((i) => i.shopId === p.shopId) : order.items
        return (
          <div key={p?.fulfillmentId ?? "all"} className="grid gap-2.5">
            {p ? (
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground [&_svg]:size-3.5">
                <Store aria-hidden="true" />
                <span className="font-medium text-foreground">{p.shopName}</span>
                {p.statusView ? <PackageStatusPill view={p.statusView} showDetail={false} /> : null}
              </div>
            ) : null}
            <StaticTable label={p ? `Items packed by ${p.shopName}` : "Items"} columns={columns} rows={rows} getRowId={(i) => i.orderItemId} />
          </div>
        )
      })}
      <dl className="ml-auto grid w-full max-w-80 text-sm tabular-nums [&_div]:flex [&_div]:justify-between [&_div]:gap-6 [&_div]:py-1.5 [&_dd]:m-0 [&_dt]:text-muted-foreground">
        <div>
          <dt>Items</dt>
          <dd>{aud(order.itemSubtotalAmount, c)}</dd>
        </div>
        <div>
          <dt>Delivery</dt>
          <dd>{aud(order.deliveryFeeAmount, c)}</dd>
        </div>
        {discount > 0 ? (
          <div>
            <dt>
              Promotion
              {order.promoCode ? <span className="font-mono"> · {order.promoCode}</span> : null}
            </dt>
            <dd className="text-brand">− {aud(order.discountAmount, c)}</dd>
          </div>
        ) : null}
        <div className="mt-1.5 border-t pt-3! text-base font-semibold [&_dt]:text-foreground!">
          <dt>Total</dt>
          <dd>{aud(order.grandTotalAmount, c)}</dd>
        </div>
      </dl>
    </div>
  )
}
