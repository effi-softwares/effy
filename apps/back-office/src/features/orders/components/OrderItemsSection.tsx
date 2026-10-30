import { ImageOff, Store } from "lucide-react"

import { Checkbox } from "@effy/design-system/ui"
import { STATUS_WORD } from "@effy/shared-types"

import { cn } from "@/lib/utils"

import { aud, type OrderDetail } from "../model"

/** How many of a line can still be refunded (0 when none). */
export const refundableOf = (order: OrderDetail, id: string) =>
  order.refundableLines.find((l) => l.orderItemId === id)?.quantity ?? 0

const GRID =
  "grid grid-cols-[28px_48px_minmax(0,1fr)_72px_104px_112px] items-center gap-4 max-md:grid-cols-[28px_48px_minmax(0,1fr)_96px]"

export interface ItemSelection {
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  /** Ticks every line that can still be refunded, or clears them. */
  onAll: (ids: readonly string[]) => void
}

/**
 * What the customer bought, at the price they paid: one list, grouped by the shop that packs each line (every line
 * is on the order — a bounded set), closed by the totals. Ticking lines offers to refund them from the action bar.
 */
export function OrderItemsSection({ order, selection }: { order: OrderDetail; selection: ItemSelection | null }) {
  const c = order.currency
  const discount = Number(order.discountAmount)
  const refundable = order.items.filter((i) => refundableOf(order, i.orderItemId) > 0).map((i) => i.orderItemId)
  const all = refundable.length > 0 && refundable.every((id) => selection?.selected.has(id))
  const some = refundable.some((id) => selection?.selected.has(id))
  const groups =
    order.packages.length > 0
      ? order.packages.map((p) => ({
          key: p.fulfillmentId,
          shop: p,
          items: order.items.filter((i) => i.shopId === p.shopId),
        }))
      : [{ key: "all", shop: null, items: order.items }]

  return (
    <div role="region" aria-label="Items" className="overflow-hidden rounded-lg border">
      <div className={cn(GRID, "border-b bg-sidebar px-4 py-2.5 text-xs font-medium text-muted-foreground")}>
        {selection ? (
          <Checkbox
            aria-label="Select every line"
            checked={all ? true : some ? "indeterminate" : false}
            disabled={refundable.length === 0}
            onCheckedChange={() => selection.onAll(all ? [] : refundable)}
          />
        ) : (
          <span />
        )}
        <span />
        <span>Item</span>
        <span className="text-right max-md:hidden">Qty</span>
        <span className="text-right max-md:hidden">Price</span>
        <span className="text-right">Total</span>
      </div>
      {groups.map((g) => (
        <div key={g.key} role="group" aria-label={g.shop ? `Packed by ${g.shop.shopName}` : "Items"}>
          {g.shop ? (
            <div className="flex items-center gap-2.5 border-b bg-sidebar px-4 py-2.5 text-[12.5px] text-muted-foreground [&_svg]:size-3.5">
              <Store aria-hidden="true" />
              <span className="font-medium text-foreground">{g.shop.shopName}</span>
              {g.shop.statusView ? <span>· {STATUS_WORD[g.shop.statusView.status]}</span> : null}
            </div>
          ) : null}
          <ul className="m-0 list-none divide-y divide-border border-b p-0">
            {g.items.map((i) => {
              const left = refundableOf(order, i.orderItemId)
              const sel = selection?.selected.has(i.orderItemId) ?? false
              return (
                <li
                  key={i.orderItemId}
                  className={cn(GRID, "px-4 py-3 transition-colors hover:bg-row-hover", sel && "bg-row-selected")}
                >
                  {selection ? (
                    <Checkbox
                      aria-label={`Select ${i.productName}`}
                      checked={sel}
                      disabled={left === 0}
                      title={left === 0 ? "Nothing left to refund" : undefined}
                      onCheckedChange={() => selection.onToggle(i.orderItemId)}
                    />
                  ) : (
                    <span />
                  )}
                  <span
                    aria-hidden="true"
                    className="grid size-12 place-items-center overflow-hidden rounded-md border bg-muted text-muted-foreground [&_svg]:size-4"
                  >
                    {i.imageUrl ? <img src={i.imageUrl} alt="" className="size-full object-cover" /> : <ImageOff />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{i.productName}</span>
                    <span className="block text-[12.5px] text-muted-foreground">
                      {[i.variantLabel, i.variantCode].filter(Boolean).join(" · ")}
                      {i.sku ? <span className="font-mono"> · {i.sku}</span> : null}
                    </span>
                  </span>
                  <span className="text-right tabular-nums max-md:hidden">×{i.quantity}</span>
                  <span className="text-right text-muted-foreground tabular-nums max-md:hidden">
                    {aud(i.unitPriceAmount, c)}
                  </span>
                  <span className="text-right font-medium tabular-nums">{aud(i.lineSubtotalAmount, c)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      <div className="grid justify-end px-4 py-4">
        <dl className="m-0 grid min-w-75 text-[13.5px] tabular-nums [&_div]:flex [&_div]:justify-between [&_div]:gap-6 [&_div]:py-1.5 [&_dd]:m-0 [&_dt]:text-muted-foreground">
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
          <div className="mt-1.5 border-t pt-3! text-[15px] font-semibold [&_dt]:text-foreground!">
            <dt>Total</dt>
            <dd>{aud(order.grandTotalAmount, c)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
