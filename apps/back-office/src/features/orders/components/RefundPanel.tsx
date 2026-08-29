import { useState } from "react";

import type { IssueRefundRequest, RefundReason } from "@effy/shared-types";
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
} from "@effy/design-system/ui";

import { refundActionError } from "../refundErrorText";
import { useIssueRefund } from "../refundQueries";

export interface RefundableLine {
  orderItemId: string;
  productName: string;
  quantity: number;
  unitPriceAmount: string;
}

/**
 * Issuing a refund (055 US1).
 *
 * ⚠ THIS IS THE ONLY CONTROL IN THIS CONSOLE THAT MOVES MONEY, and refunding is irreversible: there
 * is no un-refund, and a correction would be a new charge the platform cannot make. Everything about
 * this component is shaped by that — a confirmation step that names the amount (FR/T031), no
 * optimistic update, and an amount that is computed rather than typed.
 *
 * ⚠ TWO KINDS, NEVER BLURRED (FR-003). Selecting lines computes the amount and it CANNOT be edited:
 * if the two could disagree, the record would claim a refund covered items it did not. A goodwill
 * refund takes a free amount and REQUIRES a note, so the honest case for an untied figure — a late
 * delivery — does not have to borrow a line and put a false statement in the audit trail.
 *
 * ⚠ Detail rows and controls, no cards (Principle V), and no colour carries meaning.
 */
export function RefundPanel({
  orderId,
  lines,
  refundableAmount,
}: {
  orderId: string;
  lines: RefundableLine[];
  refundableAmount: string;
}) {
  const issue = useIssueRefund(orderId);

  const [kind, setKind] = useState<"item" | "goodwill">("item");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<RefundReason>("item_not_supplied");
  const [note, setNote] = useState("");
  const [goodwillAmount, setGoodwillAmount] = useState("");
  const [confirming, setConfirming] = useState(false);

  // ⚠ COMPUTED, never typed. This figure is what the server will independently recompute from the
  // same lines; showing anything else would be a promise the server may not keep.
  const computed = lines
    .filter((l) => selected[l.orderItemId])
    .reduce((sum, l) => sum + Number(l.unitPriceAmount) * (selected[l.orderItemId] ?? 0), 0);

  const amountToRefund = kind === "item" ? computed.toFixed(2) : goodwillAmount;
  const canSubmit =
    kind === "item"
      ? computed > 0
      : goodwillAmount.trim() !== "" && Number(goodwillAmount) > 0 && note.trim() !== "";

  function body(): IssueRefundRequest {
    if (kind === "goodwill") {
      return { kind: "goodwill", amount: goodwillAmount, note };
    }
    return {
      kind: "item",
      reason: reason as Exclude<RefundReason, "goodwill">,
      note: note.trim() === "" ? undefined : note,
      lines: lines
        .filter((l) => selected[l.orderItemId])
        .map((l) => ({ orderItemId: l.orderItemId, quantity: selected[l.orderItemId]! })),
    };
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
              const next = { ...s };
              if (qty <= 0) delete next[id];
              else next[id] = qty;
              return next;
            })
          }
          reason={reason}
          onReason={setReason}
          computed={computed}
        />
      ) : (
        <GoodwillFields
          amount={goodwillAmount}
          onAmount={setGoodwillAmount}
          note={note}
          onNote={setNote}
        />
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
          {/* ⚠ "on its way", NOT "refunded". The bank has not moved anything and may refuse it weeks
              later (FR-007). Telling staff it is done would make them stop watching. */}
          {issue.data.amount} is on its way back to the customer. {issue.data.remainingAmount} remains
          refundable.
        </p>
      ) : null}

      {/* ⚠ T031 — A CONFIRMATION THAT NAMES THE AMOUNT. This control moves real money and refunding
          is irreversible; a mis-click here is not a wrong pixel. The dialog states the figure and what
          it covers, so confirming is a deliberate act rather than a second click in the same place. */}
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
                    setSelected({});
                    setGoodwillAmount("");
                    setNote("");
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
  );
}

function ItemSelection({
  lines,
  selected,
  onToggle,
  reason,
  onReason,
  computed,
}: {
  lines: RefundableLine[];
  selected: Record<string, number>;
  onToggle: (id: string, qty: number) => void;
  reason: RefundReason;
  onReason: (r: RefundReason) => void;
  computed: number;
}) {
  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">Every line on this order is fully refunded.</p>;
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
          <Label htmlFor={`line-${l.orderItemId}`} className="flex-1 font-normal">
            {l.productName}
            <span className="ml-2 text-muted-foreground">
              {l.unitPriceAmount} each · {l.quantity} refundable
            </span>
          </Label>
          {selected[l.orderItemId] ? (
            <Input
              aria-label={`Quantity to refund for ${l.productName}`}
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

      {/* ⚠ Read-only, and that is the requirement (FR-003 / A7a). If this could be typed over, the
          amount and the line selection could disagree, and the record would claim a refund covered
          items it did not. */}
      <dl className="grid grid-cols-[10rem_1fr] gap-x-4 text-sm">
        <dt className="text-muted-foreground">Amount</dt>
        <dd className="tabular-nums font-medium">{computed.toFixed(2)}</dd>
      </dl>
    </div>
  );
}

function GoodwillFields({
  amount,
  onAmount,
  note,
  onNote,
}: {
  amount: string;
  onAmount: (v: string) => void;
  note: string;
  onNote: (v: string) => void;
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
        {/* ⚠ REQUIRED, and the database refuses without it. An amount with no line and no explanation
            is unaccountable — nobody reading the record later can say what it was for. */}
        <Textarea
          id="goodwill-note"
          value={note}
          onChange={(e) => onNote(e.target.value)}
          placeholder="e.g. delivered two hours late"
        />
      </div>
    </div>
  );
}
