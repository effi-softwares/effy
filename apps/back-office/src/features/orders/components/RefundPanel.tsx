import { useState } from "react"

import type { IssueRefundRequest, RefundReason } from "@effy/shared-types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@effy/design-system/ui"

import { refundActionError } from "../refundErrorText"
import { useIssueRefund } from "../refundQueries"

interface RefundableLine {
  orderItemId: string
  productName: string
  variantLabel?: string | null
  quantity: number
  unitPriceAmount: string
}

export function RefundPanel({
  orderId,
  lines,
  refundableAmount,
}: {
  orderId: string
  lines: RefundableLine[]
  refundableAmount: string
}) {
  const issue = useIssueRefund(orderId)

  const [kind, setKind] = useState<"item" | "goodwill">("item")
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [reason, setReason] = useState<RefundReason>("item_not_supplied")
  const [note, setNote] = useState("")
  const [goodwillAmount, setGoodwillAmount] = useState("")
  const [confirming, setConfirming] = useState(false)

  const computed = lines
    .filter((l) => selected[l.orderItemId])
    .reduce((sum, l) => sum + Number(l.unitPriceAmount) * (selected[l.orderItemId] ?? 0), 0)

  const amountToRefund = kind === "item" ? computed.toFixed(2) : goodwillAmount
  const canSubmit =
    kind === "item" ? computed > 0 : goodwillAmount.trim() !== "" && Number(goodwillAmount) > 0 && note.trim() !== ""

  function body(): IssueRefundRequest {
    if (kind === "goodwill") {
      return { kind: "goodwill", amount: goodwillAmount, note }
    }
    return {
      kind: "item",
      reason: reason as Exclude<RefundReason, "goodwill">,
      note: note.trim() === "" ? undefined : note,
      lines: lines
        .filter((l) => selected[l.orderItemId])
        .map((l) => ({ orderItemId: l.orderItemId, quantity: selected[l.orderItemId]! })),
    }
  }

  return (
    <section className="space-y-4">
      <div className="border-b pb-2">
        <h2 className="text-sm font-semibold">Issue a refund</h2>
      </div>

      <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Refundable</dt>
        <dd className="tabular-nums">{refundableAmount}</dd>
      </dl>

      <div className="space-y-1.5">
        <Label htmlFor="refund-kind">Kind</Label>
        <Select value={kind} onValueChange={(v) => setKind(v as "item" | "goodwill")}>
          <SelectTrigger id="refund-kind" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="item">Refund specific items</SelectItem>
            <SelectItem value="goodwill">Goodwill</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {kind === "item" ? (
        <ItemSelection
          lines={lines}
          selected={selected}
          onToggle={(id, qty) =>
            setSelected((s) => {
              const next = { ...s }
              if (qty <= 0) delete next[id]
              else next[id] = qty
              return next
            })
          }
          reason={reason}
          onReason={setReason}
          computed={computed}
        />
      ) : (
        <GoodwillFields amount={goodwillAmount} onAmount={setGoodwillAmount} note={note} onNote={setNote} />
      )}

      <Button disabled={!canSubmit || issue.isPending} onClick={() => setConfirming(true)}>
        {issue.isPending ? "Refunding…" : "Refund…"}
      </Button>

      {issue.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {refundActionError(issue.error)}
        </p>
      ) : null}
      {issue.isSuccess ? (
        <p role="status" className="text-sm">
          {issue.data.amount} is on its way back to the customer. {issue.data.remainingAmount} remains refundable.
        </p>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refund {amountToRefund} to the customer?</AlertDialogTitle>
            <AlertDialogDescription>
              {kind === "item"
                ? `This returns ${amountToRefund} for the selected items to the card the customer paid with.`
                : `This returns ${amountToRefund} to the card the customer paid with as a goodwill refund.`}{" "}
              Refunds cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                issue.mutate(body(), {
                  onSuccess: () => {
                    setSelected({})
                    setGoodwillAmount("")
                    setNote("")
                  },
                })
              }
            >
              Refund {amountToRefund}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function ItemSelection({
  lines,
  selected,
  onToggle,
  reason,
  onReason,
  computed,
}: {
  lines: RefundableLine[]
  selected: Record<string, number>
  onToggle: (id: string, qty: number) => void
  reason: RefundReason
  onReason: (r: RefundReason) => void
  computed: number
}) {
  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">Every line on this order is fully refunded.</p>
  }
  return (
    <div className="space-y-3">
      {lines.map((l) => (
        <div key={l.orderItemId} className="flex items-center gap-3 text-sm">
          <Checkbox
            id={`line-${l.orderItemId}`}
            checked={Boolean(selected[l.orderItemId])}
            onCheckedChange={(on) => onToggle(l.orderItemId, on ? 1 : 0)}
          />
          <Label htmlFor={`line-${l.orderItemId}`} className="flex-1">
            {l.productName}
            {l.variantLabel ? <span className="text-muted-foreground"> — {l.variantLabel}</span> : null}
            <span className="ml-2 text-muted-foreground">
              {l.unitPriceAmount} each · {l.quantity} refundable
            </span>
          </Label>
          {selected[l.orderItemId] ? (
            <Input
              aria-label={`Quantity to refund for ${l.productName}${l.variantLabel ? ` — ${l.variantLabel}` : ""}`}
              inputMode="numeric"
              className="w-20"
              value={String(selected[l.orderItemId])}
              onChange={(e) => onToggle(l.orderItemId, Math.min(Number(e.target.value) || 0, l.quantity))}
            />
          ) : null}
        </div>
      ))}

      <div className="space-y-1.5">
        <Label htmlFor="refund-reason">Reason</Label>
        <Select value={reason} onValueChange={(v) => onReason(v as RefundReason)}>
          <SelectTrigger id="refund-reason" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="item_not_supplied">Item not supplied</SelectItem>
            <SelectItem value="item_unusable">Item damaged, spoiled or incorrect</SelectItem>
            <SelectItem value="order_cancelled">Order cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <dl className="grid grid-cols-[10rem_1fr] gap-x-4 text-sm">
        <dt className="text-muted-foreground">Amount</dt>
        <dd className="tabular-nums font-medium">{computed.toFixed(2)}</dd>
      </dl>
    </div>
  )
}

function GoodwillFields({
  amount,
  onAmount,
  note,
  onNote,
}: {
  amount: string
  onAmount: (v: string) => void
  note: string
  onNote: (v: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="goodwill-amount">Amount</Label>
        <Input
          id="goodwill-amount"
          inputMode="decimal"
          className="w-32"
          value={amount}
          onChange={(e) => onAmount(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="goodwill-note">Why</Label>
        <Textarea
          id="goodwill-note"
          value={note}
          onChange={(e) => onNote(e.target.value)}
          placeholder="e.g. delivered two hours late"
        />
      </div>
    </div>
  )
}
