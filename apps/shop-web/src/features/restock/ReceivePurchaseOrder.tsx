import { useEffect, useState } from "react"

import {
  Button,
  Input,
  Label,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@effy/design-system/ui"
import type { PurchaseOrderDTO } from "@effy/shared-types"

import { productMutationError } from "@/features/catalog/errorText"

import { useReceivePurchaseOrder } from "./queries"

/**
 * Record goods arriving against a purchase order (US6, T059).
 *
 * ⚠ THE FIELD IS THE CUMULATIVE TOTAL RECEIVED, NOT "how many turned up today", and the label says
 * so. That is what makes the write idempotent: re-submitting the same figure books the pallet once,
 * so a double-tap on a shop tablet with a flaky connection is harmless. A "how many arrived" field
 * would be a delta, and a delta cannot be made safe without a dedupe key the operator has no way to
 * supply.
 *
 * ⚠ IT IS PRE-FILLED WITH WHAT WAS ORDERED, because that is what usually turns up — but the figure is
 * fully editable in both directions. Correcting a mis-keyed receive downwards is a first-class action,
 * not an undo buried somewhere: the order re-derives its own status afterwards and reopens itself.
 */
export function ReceivePurchaseOrder({
  order,
  open,
  onOpenChange,
}: {
  order: PurchaseOrderDTO
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const receive = useReceivePurchaseOrder(order.id)
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValues(
      Object.fromEntries(
        order.lines.map((l) => [
          l.id,
          String(l.receivedQuantity > 0 ? l.receivedQuantity : l.orderedQuantity),
        ]),
      ),
    )
    setError(null)
  }, [order, open])

  function submit() {
    setError(null)
    receive.mutate(
      {
        lines: order.lines.map((l) => ({
          lineId: l.id,
          receivedQuantity: Number(values[l.id] ?? l.receivedQuantity),
        })),
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: (e) => setError(productMutationError(e)),
      },
    )
  }

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent className="sm:max-w-lg">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Receive {order.reference}</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Enter the total received so far for each line — not just today&apos;s delivery. Stock goes
            up by the difference, and every change is recorded against this order.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <ul className="divide-y rounded-md border">
          {order.lines.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{l.productName}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  ordered {l.orderedQuantity} · received so far {l.receivedQuantity}
                </span>
              </span>
              <span className="space-y-1">
                <Label htmlFor={`r-${l.id}`} className="text-xs">
                  Total received
                </Label>
                <Input
                  id={`r-${l.id}`}
                  inputMode="numeric"
                  className="w-24"
                  value={values[l.id] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [l.id]: e.target.value }))}
                />
              </span>
            </li>
          ))}
        </ul>

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}

        <ResponsiveModalFooter>
          <Button variant="ghost" disabled={receive.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={receive.isPending} onClick={submit}>
            {receive.isPending ? "Recording…" : "Record delivery"}
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}
