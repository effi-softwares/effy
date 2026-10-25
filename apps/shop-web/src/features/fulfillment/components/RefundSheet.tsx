import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { Button, Input, Switch, toast } from "@effy/design-system/ui"

import { ChoiceCards } from "@/components/console/ChoiceCards"

import { DesignSheet, SheetToggleRow } from "@/components/console/DesignSheet"
import { track } from "@/lib/telemetry"

import { fulfillmentMutationError } from "../errorText"
import { formatMoney, refundableQuantity, type OrderLine } from "../orderConsole"
import { invalidateOrders } from "../queries"
import { issueShopRefund } from "../repo"
import { lineCodes } from "../codes"

interface RefundTarget {
  id: string
  orderId: string
  orderNumber: string
  currency: string
  lines: Pick<
    OrderLine,
    | "orderItemId"
    | "name"
    | "variantLabel"
    | "variantCode"
    | "sku"
    | "orderedQuantity"
    | "refundedQuantity"
    | "unitPrice"
  >[]
}

type Reason = "item_not_supplied" | "item_unusable"

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

  useEffect(() => {
    if (open) {
      setQuantities({})
      setReason("item_not_supplied")
      setRestock(false)
    }
  }, [open])

  const qty = (id: string, max: number) => Math.max(0, Math.min(max, Number.parseInt(quantities[id] ?? "", 10) || 0))
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
              className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border py-3"
            >
              <div className="grid min-w-0 flex-1 gap-1">
                <div className="font-medium">
                  {l.name}
                  {l.variantLabel ? ` · ${l.variantLabel}` : ""}
                </div>
                <div className="text-sm text-muted-foreground">
                  {lineCodes(l.variantCode, l.sku)} · {formatMoney(l.unitPrice, detail.currency)} each
                  {l.refundedQuantity > 0 ? ` · ${l.refundedQuantity} already refunded` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`Quantity to refund for ${l.name}`}
                  inputMode="numeric"
                  disabled={max === 0}
                  value={quantities[l.orderItemId] ?? ""}
                  placeholder="0"
                  onChange={(e) => setQuantities((q) => ({ ...q, [l.orderItemId]: e.target.value.replace(/\D/g, "") }))}
                  className="w-16 text-right tabular-nums"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={max === 0}
                  onClick={() => setQuantities((q) => ({ ...q, [l.orderItemId]: String(max) }))}
                >
                  {max === 0 ? "refunded" : `max ${max}`}
                </Button>
                <div className="w-20 text-right whitespace-nowrap tabular-nums">
                  {formatMoney(((Math.round(Number(l.unitPrice) * 100) * n) / 100).toFixed(2), detail.currency)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <ChoiceCards
        label="Reason"
        value={reason}
        options={[
          { value: "item_not_supplied", label: "We couldn't supply it" },
          { value: "item_unusable", label: "It arrived unusable" },
        ]}
        onChange={(v) => setReason(v as Reason)}
      />

      <SheetToggleRow
        title="Return items to stock"
        detail="Only if you still have them and they can be sold."
        control={<Switch checked={restock} onCheckedChange={setRestock} aria-label="Return items to stock" />}
      />

      <div className="flex items-baseline justify-between border-t border-border pt-3">
        <div className="font-semibold">Refund total</div>
        <output className="text-2xl leading-7 font-semibold tracking-[-.02em] tabular-nums">
          {formatMoney((totalCents / 100).toFixed(2), detail.currency)}
        </output>
      </div>
      <p className="text-sm text-muted-foreground">A preview — Effy prices the refund when it is issued.</p>
    </DesignSheet>
  )
}
