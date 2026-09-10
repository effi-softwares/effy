import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { Switch, toast } from "@effy/design-system/ui"

import { DesignSheet, SheetField, SheetToggleRow } from "@/components/console/DesignSheet"
import { track } from "@/lib/telemetry"

import { fulfillmentMutationError } from "../errorText"
import { formatMoney, refundableQuantity, type OrderLine } from "../orderConsole"
import { invalidateOrders } from "../queries"
import { issueShopRefund } from "../repo"

/** What the sheet needs to know about the order: the portion, the order, and this shop's priced lines. */
export interface RefundTarget {
  /** The portion (shop_fulfillment.id) — telemetry's unit of work. */
  id: string
  orderId: string
  orderNumber: string
  currency: string
  lines: Pick<OrderLine, "orderItemId" | "name" | "sku" | "orderedQuantity" | "refundedQuantity" | "unitPrice">[]
}

type Reason = "item_not_supplied" | "item_unusable"

/**
 * Refunding this shop's portion of an order (057 US5) — the design's `isRefund` sheet: one row per
 * line with a quantity field, a "max" shortcut and the line's total; the reason; "Return items to
 * stock"; and the refund total.
 *
 * ⚠ IT SENDS LINES AND QUANTITIES, NEVER AN AMOUNT. The server prices the refund from the receipt and
 * REFUSES a client-supplied amount (055 FR-003), so the total here is only a preview of that pricing.
 * ⚠ The design's "Refund shipping" toggle is absent: a shop refund covers the shop's own lines, and the
 * delivery fee is Effy's to return.
 * ⚠ ONLY THIS SHOP'S LINES, clamped to what is not already on its way back; the server re-checks both.
 * ⚠ MANAGER-ONLY, and this component is not the gate — the backend decides from the platform record.
 */
export function RefundSheet({
  detail,
  open,
  onOpenChange,
}: {
  detail: RefundTarget
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [reason, setReason] = useState<Reason>("item_not_supplied")
  const [restock, setRestock] = useState(false)

  // Each opening starts clean, never from a half-finished choice left from the last time.
  useEffect(() => {
    if (open) {
      setQuantities({})
      setReason("item_not_supplied")
      setRestock(false)
    }
  }, [open])

  const qty = (id: string, max: number) =>
    Math.max(0, Math.min(max, Number.parseInt(quantities[id] ?? "", 10) || 0))
  const chosen = detail.lines
    .map((l) => ({ line: l, n: qty(l.orderItemId, refundableQuantity(l)) }))
    .filter((c) => c.n > 0)
  const totalCents = chosen.reduce((c, { line, n }) => c + Math.round(Number(line.unitPrice) * 100) * n, 0)

  const refund = useMutation({
    mutationFn: () =>
      issueShopRefund(detail.orderId, {
        lines: chosen.map(({ line, n }) => ({ orderItemId: line.orderItemId, quantity: n })),
        reason,
        restock,
      }),
    onSuccess: (res) => {
      track({ name: "shop_refund_initiated", fulfillmentId: detail.id })
      // ⚠ "Sent", not "refunded": the provider accepting it means only that it is on its way (055).
      toast.success(`Refund of ${formatMoney(res.amount, detail.currency)} sent`, {
        description: detail.orderNumber,
      })
      invalidateOrders(queryClient)
      onOpenChange(false)
    },
  })

  return (
    <DesignSheet
      open={open}
      onOpenChange={onOpenChange}
      wide
      title="Refund"
      description="Pick the lines to refund. Effy returns the money to the customer's card."
      saveLabel="Issue refund"
      canSave={chosen.length > 0}
      saving={refund.isPending}
      error={refund.isError ? fulfillmentMutationError(refund.error) : null}
      onSave={() => refund.mutate()}
    >
      <div className="grid">
        {detail.lines.map((l) => {
          const max = refundableQuantity(l)
          const n = qty(l.orderItemId, max)
          return (
            <div
              key={l.orderItemId}
              className="border-border flex flex-wrap items-center justify-between gap-3 border-b py-2.5"
            >
              <div className="grid min-w-0 flex-1 gap-0.5">
                <div className="text-[13.5px] font-medium">{l.name}</div>
                <div className="text-muted-foreground font-mono text-[12px]">
                  {l.sku ?? "no SKU"} · {formatMoney(l.unitPrice, detail.currency)} each
                  {l.refundedQuantity > 0 ? ` · ${l.refundedQuantity} already refunded` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  aria-label={`Quantity to refund for ${l.name}`}
                  inputMode="numeric"
                  disabled={max === 0}
                  value={quantities[l.orderItemId] ?? ""}
                  placeholder="0"
                  onChange={(e) =>
                    setQuantities((q) => ({ ...q, [l.orderItemId]: e.target.value.replace(/\D/g, "") }))
                  }
                  className="border-input bg-background focus:border-ring h-8 w-14 rounded-md border px-2 text-right text-[13px] outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={max === 0}
                  onClick={() => setQuantities((q) => ({ ...q, [l.orderItemId]: String(max) }))}
                  className="text-muted-foreground hover:bg-accent hover:text-foreground h-8 cursor-pointer rounded-[5px] border-none bg-transparent px-2 text-[12px] whitespace-nowrap disabled:opacity-50"
                >
                  {max === 0 ? "refunded" : `max ${max}`}
                </button>
                <div className="w-[74px] text-right text-[13px] whitespace-nowrap tabular-nums">
                  {formatMoney(((Math.round(Number(l.unitPrice) * 100) * n) / 100).toFixed(2), detail.currency)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <SheetField label="Reason" htmlFor="refund-reason">
        <select
          id="refund-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as Reason)}
          className="border-input bg-background focus:border-ring h-9 cursor-pointer rounded-md border px-2.5 text-sm outline-none"
        >
          {/* Effy's vocabulary — the business needs to tell these apart for its own reporting. */}
          <option value="item_not_supplied">We couldn&apos;t supply it</option>
          <option value="item_unusable">It arrived unusable</option>
        </select>
      </SheetField>

      {/* ⚠ OFF by default, and the default is the honest one — a shop refunding an unusable item has
          nothing to put back. Honoured by core-api since 057 A3 (it used to be ignored). */}
      <SheetToggleRow
        title="Return items to stock"
        detail="Only if you still have them and they can be sold."
        control={<Switch checked={restock} onCheckedChange={setRestock} aria-label="Return items to stock" />}
      />

      <div className="border-border flex items-baseline justify-between border-t pt-3">
        <div className="text-sm font-semibold">Refund total</div>
        <div className="text-base font-semibold tabular-nums">
          {formatMoney((totalCents / 100).toFixed(2), detail.currency)}
        </div>
      </div>
    </DesignSheet>
  )
}
