import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import {
  type DeliveryCompensationKind,
  type DeliveryMoveChoiceDTO,
  type DeliveryMoveResponse,
  courierEstimateSentence,
} from "@effy/shared-types"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
  Textarea,
} from "@effy/design-system/ui"

import { deliveryMoveError, deliveryMoveRefusalText } from "../errorText"
import { deliveryMovePreviewQuery, useDeliveryMove } from "../queries"

const COLLECTION_LABEL = { hub: "Via the hub", supplier: "Pickup from the supplier" } as const
const REFUND_STATUS_TEXT: Record<string, string> = {
  submitted: "The refund is with the payment provider.",
  succeeded: "The refund has been made.",
  submitting: "The payment provider has not answered yet; the refund will be retried automatically.",
  refused: "The payment provider refused the refund. Issue it from Refunds below.",
}

function choiceText(c: DeliveryMoveChoiceDTO): string {
  switch (c.kind) {
    case "points_difference":
      return `Points for the difference - ${c.points ?? 0} points ($${c.amount})`
    case "free_delivery_points":
      return `Free delivery, as points - ${c.points ?? 0} points ($${c.amount})`
    case "free_delivery_refund":
      return `Free delivery, back to the card - $${c.amount}`
    case "refund_difference":
      return `Refund the difference to the card - $${c.amount}`
    case "none":
      return "Nothing"
  }
}

interface Props {
  orderId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SendByCourierDialog({ orderId, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Send by courier</DialogTitle>
          <DialogDescription>
            For emergencies only. The delivery window is given up, the order leaves Effy drivers&apos; work, and the
            customer is told straight away.
          </DialogDescription>
        </DialogHeader>
        <SendByCourierForm orderId={orderId} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function SendByCourierForm({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const preview = useQuery(deliveryMovePreviewQuery(orderId, "courier"))
  const move = useDeliveryMove(orderId)
  const [reason, setReason] = useState("")
  const [choice, setChoice] = useState<DeliveryCompensationKind>("points_difference")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<DeliveryMoveResponse | null>(null)

  const p = preview.data
  const chosen = p?.choices.find((c) => c.kind === choice)
  const canConfirm =
    !!p?.allowed && !!chosen && reason.trim() !== "" && (choice !== "none" || note.trim() !== "") && !move.isPending

  async function confirm() {
    if (!p || !chosen) return
    setError(null)
    try {
      setDone(
        await move.mutateAsync({
          to: "courier",
          reason: reason.trim(),
          compensation: choice,
          compensationNote: note.trim() || null,
          expectedUpdatedAt: p.updatedAt,
          expectedAmount: chosen.amount,
        }),
      )
    } catch (err) {
      setError(deliveryMoveError(err))
      await preview.refetch()
    }
  }

  return (
    <>
      {done ? (
        <div className="space-y-2 text-sm" role="status">
          <p className="font-medium">The order now goes by courier. The customer has been told.</p>
          {done.refund ? <p>{REFUND_STATUS_TEXT[done.refund.status] ?? REFUND_STATUS_TEXT.submitting}</p> : null}
        </div>
      ) : preview.isPending ? (
        <p className="text-sm text-muted-foreground">Working out the figures…</p>
      ) : !p ? (
        <p className="text-sm text-destructive" role="alert">
          {deliveryMoveError(preview.error)}
        </p>
      ) : !p.allowed ? (
        <p className="text-sm" role="alert">
          {deliveryMoveRefusalText(p.refusal?.code ?? "")}
        </p>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-[12rem_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Customer paid for delivery</dt>
            <dd className="tabular-nums">${p.paidDeliveryAmount}</dd>
            <dt className="text-muted-foreground">Courier delivery costs</dt>
            <dd className="tabular-nums">${p.courierFeeAmount}</dd>
            <dt className="text-muted-foreground">Difference</dt>
            <dd className="tabular-nums">
              ${p.differenceAmount}
              {p.differenceAmount === "0.00" ? (
                <span className="text-muted-foreground"> - the courier costs as much or more; Effy bears it</span>
              ) : null}
            </dd>
            {p.courier ? (
              <>
                <dt className="text-muted-foreground">Courier</dt>
                <dd>
                  {p.courier.courierName} · {p.courier.serviceName} -{" "}
                  {COLLECTION_LABEL[p.courier.collection].toLowerCase()}
                </dd>
                <dt className="text-muted-foreground">Customer will be told</dt>
                <dd>{courierEstimateSentence(p.courier.estimate)}</dd>
              </>
            ) : null}
          </dl>

          <div className="space-y-2">
            <Label htmlFor="move-reason">Why (staff only - the customer never sees this)</Label>
            <Textarea id="move-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Make it right</legend>
            <RadioGroup
              value={choice}
              onValueChange={(v) => setChoice(v as DeliveryCompensationKind)}
              aria-label="Make it right"
            >
              {p.choices.map((c) => (
                <div key={c.kind} className="flex items-start gap-2 text-sm">
                  <RadioGroupItem id={`comp-${c.kind}`} value={c.kind} />
                  <Label htmlFor={`comp-${c.kind}`}>
                    {choiceText(c)}
                    {c.default ? <span className="text-muted-foreground"> (recommended)</span> : null}
                    {c.lastResort ? <span className="text-muted-foreground"> (last resort)</span> : null}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {choice === "free_delivery_refund" || choice === "refund_difference" ? (
              <p className="text-sm text-muted-foreground">
                An order paid partly with points gets the same share back as points. At most ${p.refundableAmount} can
                still be refunded.
              </p>
            ) : null}
            {choice === "none" ? (
              <div className="space-y-2">
                <Label htmlFor="move-note">Why nothing is given</Label>
                <Textarea id="move-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
              </div>
            ) : null}
          </fieldset>
        </div>
      )}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        {done ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!canConfirm} onClick={() => void confirm()}>
              Send by courier
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  )
}
