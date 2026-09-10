import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Undo2 } from "lucide-react"

import {
  Button,
  Checkbox,
  Input,
  Label,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from "@effy/design-system/ui"

import { track } from "@/lib/telemetry"

import { fulfillmentMutationError } from "../errorText"
import { formatMoney, refundableQuantity, type OrderLine } from "../orderConsole"
import { invalidateOrders } from "../queries"
import { issueShopRefund } from "../repo"

/**
 * What the sheet needs to know about the order (057 A3): the portion, the order it belongs to, and
 * this shop's priced lines with what is already on its way back.
 */
export interface RefundTarget {
  /** The portion (shop_fulfillment.id) — telemetry's unit of work. */
  id: string
  orderId: string
  orderNumber: string
  currency: string
  lines: Pick<OrderLine, "orderItemId" | "name" | "orderedQuantity" | "refundedQuantity" | "unitPrice">[]
}

/**
 * Refunding this shop's portion of an order (US5, FR-014).
 *
 * ⚠ IT NAMES LINES AND QUANTITIES, NEVER AN AMOUNT. The server computes the money from the receipt
 * lines and REFUSES a client-supplied amount outright (055 FR-003) — if a caller could send both they
 * could disagree, and the record would claim a refund covered items it did not. So there is no total
 * field on this form, and the figure the operator sees is only ever a preview.
 *
 * ⚠ AND IT ONLY OFFERS THIS SHOP'S OWN LINES, because that is all the pick list contains (020's
 * projection never selects another shop's items). The server re-checks anyway and refuses the whole
 * request if a line falls outside the caller's portion — never silently dropping the excess, which is
 * 055's own `orderItemId` lesson.
 *
 * ⚠ MANAGER-ONLY, AND THIS COMPONENT IS NOT THE GATE. The backend decides from the platform record
 * (role AND status AND shop scope). Withholding the control from a `shop_staff` operator is a courtesy
 * so they never meet a refusal they cannot act on — see `OrderDetailScreen`.
 */
export function RefundSheet({
  detail,
  open,
  onOpenChange,
  initialLineId,
}: {
  detail: RefundTarget
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 057 A3 — a line-level "Refund" opens the sheet with that one line already chosen. */
  initialLineId?: string | null
}) {
  const queryClient = useQueryClient()
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  // Each opening starts from the line it was opened for (or none), never from a half-finished choice
  // left behind by the last time the sheet was closed.
  useEffect(() => {
    if (!open) return
    const line = detail.lines.find((l) => l.orderItemId === initialLineId)
    setQuantities(line ? { [line.orderItemId]: refundableQuantity(line) } : {})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed on open, not on every re-read
  }, [open, initialLineId])
  const [reason, setReason] = useState<"item_not_supplied" | "item_unusable">("item_not_supplied")
  const [note, setNote] = useState("")
  const [restock, setRestock] = useState(false)

  const refund = useMutation({
    mutationFn: () =>
      issueShopRefund(detail.orderId, {
        lines: Object.entries(quantities)
          .filter(([, q]) => q > 0)
          .map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
        reason,
        note: note.trim() || undefined,
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
      setQuantities({})
      setNote("")
    },
  })

  const selectedCount = Object.values(quantities).filter((q) => q > 0).length
  // ⚠ A PREVIEW, labelled as one. The server prices the refund from the receipt; this multiplies the
  // same receipt prices so the operator sees roughly what they are about to send back.
  const preview = detail.lines.reduce(
    (c, l) => c + Math.round(Number(l.unitPrice) * 100) * (quantities[l.orderItemId] ?? 0),
    0,
  )

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent className="sm:max-w-lg">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Refund items</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Choose what to refund from your shop&apos;s part of {detail.orderNumber}. Effy returns the
            money to the customer&apos;s original payment method.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="space-y-4">
          <ul className="divide-y rounded-md border">
            {detail.lines.map((item) => {
              const chosen = quantities[item.orderItemId] ?? 0
              const left = refundableQuantity(item)
              return (
                <li key={item.orderItemId} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    id={`refund-${item.orderItemId}`}
                    aria-label={`Refund ${item.name}`}
                    checked={chosen > 0}
                    disabled={left === 0}
                    onCheckedChange={(v) =>
                      setQuantities((q) => ({
                        ...q,
                        [item.orderItemId]: v === true ? left : 0,
                      }))
                    }
                  />
                  <Label
                    htmlFor={`refund-${item.orderItemId}`}
                    className="min-w-0 flex-1 font-normal"
                  >
                    <span className="block truncate">{item.name}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      ordered {item.orderedQuantity}
                      {item.refundedQuantity > 0 ? ` · ${item.refundedQuantity} already refunded` : ""}
                    </span>
                  </Label>
                  {/* ⚠ Clamped to what is still refundable — ordered, minus what is already on its way
                      back. Refunding more units than were sold is not a generosity the platform can
                      express — the server refuses it (ErrLineOverRefunded) and so should the control,
                      rather than offering a value that will bounce. */}
                  <Input
                    aria-label={`Quantity to refund for ${item.name}`}
                    inputMode="numeric"
                    className="w-20"
                    disabled={chosen === 0}
                    value={chosen === 0 ? "" : String(chosen)}
                    onChange={(e) => {
                      const n = Math.max(0, Math.min(left, Number(e.target.value) || 0))
                      setQuantities((q) => ({ ...q, [item.orderItemId]: n }))
                    }}
                  />
                </li>
              )
            })}
          </ul>

          <div className="space-y-1.5">
            <Label htmlFor="refund-reason">Reason</Label>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as "item_not_supplied" | "item_unusable")}
            >
              <SelectTrigger id="refund-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* ⚠ Effy's vocabulary, not the payment provider's. The provider collapses all of
                    these to one value; the business needs to tell them apart for its own reporting. */}
                <SelectItem value="item_not_supplied">We couldn&apos;t supply it</SelectItem>
                <SelectItem value="item_unusable">It arrived unusable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="refund-note">Note (optional)</Label>
            <Input
              id="refund-note"
              placeholder="e.g. the chiller failed overnight"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex items-start gap-3 rounded-md border px-3 py-2">
            <Switch
              id="refund-restock"
              checked={restock}
              onCheckedChange={setRestock}
              aria-label="Return these items to stock"
            />
            <Label htmlFor="refund-restock" className="font-normal">
              Put these back on the shelf
              {/* ⚠ OFF by default, and the default is the honest one. 055 settled that stock returns
                  happen only "where the platform can know it should" — inventing stock is worse than
                  not returning it, and a shop refunding an unusable item has nothing to put back. */}
              <span className="text-muted-foreground mt-0.5 block text-xs">
                Only if you still have them and they can be sold.
              </span>
            </Label>
          </div>

          {selectedCount > 0 ? (
            <p className="text-muted-foreground text-[13px]">
              About{" "}
              <span className="text-foreground font-medium tabular-nums">
                {formatMoney((preview / 100).toFixed(2), detail.currency)}
              </span>{" "}
              — Effy prices the refund from the receipt.
            </p>
          ) : null}

          {refund.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {fulfillmentMutationError(refund.error)}
            </p>
          ) : null}
        </div>

        <ResponsiveModalFooter>
          <Button variant="ghost" disabled={refund.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={selectedCount === 0 || refund.isPending}
            onClick={() => refund.mutate()}
          >
            {refund.isPending ? <Loader2 className="animate-spin" /> : <Undo2 />}
            {refund.isPending
              ? "Refunding…"
              : `Refund ${selectedCount} item${selectedCount === 1 ? "" : "s"}`}
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}
