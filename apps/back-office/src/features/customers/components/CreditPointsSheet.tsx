import { useState } from "react";

import { POINTS_CREDIT_REASONS, POINTS_REASON_LABELS, type PointsCreditReason } from "@effy/shared-types";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Textarea,
  toast,
} from "@effy/design-system/ui";

import { pointsActionError } from "../errorText";
import { useCreditPoints } from "../queries";
import { formatPointsValue, parsePoints } from "./points-format";

const NO_ORDER = "none";

/**
 * Credit points to a customer (074 US1).
 *
 * ⚠ THE NOTE IS INTERNAL, and the form says so. The customer is told the REASON in Effy's own words;
 * what is typed here stays in back-office.
 *
 * ⚠ A csa sees their limit before they hit it. The server refuses above it anyway — this is the
 * courtesy, not the gate.
 */
export function CreditPointsSheet({
  open,
  onOpenChange,
  customerId,
  customerName,
  orders,
  defaultOrderId,
  limit,
  centsPerPoint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  orders: { id: string; orderNumber: string }[];
  defaultOrderId?: string;
  /** The per-credit limit for this staff member, or null when they have none. */
  limit: number | null;
  centsPerPoint: number;
}) {
  const credit = useCreditPoints(customerId);
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState<PointsCreditReason>("goodwill");
  const [note, setNote] = useState("");
  const [orderId, setOrderId] = useState<string>(defaultOrderId ?? NO_ORDER);
  const [error, setError] = useState<string | null>(null);

  const n = parsePoints(points);
  const overLimit = n !== null && limit !== null && n > limit;
  const noteMissing = reason === "other" && note.trim() === "";
  const canSubmit = n !== null && !overLimit && !noteMissing && !credit.isPending;

  const submit = () => {
    if (n === null) return;
    setError(null);
    credit.mutate(
      { points: n, reason, note: note.trim(), ...(orderId !== NO_ORDER ? { orderId } : {}) },
      {
        onSuccess: () => {
          toast(`${n.toLocaleString("en-AU")} points credited to ${customerName}.`);
          setPoints("");
          setNote("");
          onOpenChange(false);
        },
        onError: (err) => setError(pointsActionError(err)),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Credit points</SheetTitle>
          <SheetDescription>{customerName}</SheetDescription>
        </SheetHeader>

        <form
          className="space-y-4 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="credit-points">Points</Label>
            <Input id="credit-points" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} autoFocus />
            <p className="text-sm text-muted-foreground">
              {n !== null ? `Worth ${formatPointsValue(n, centsPerPoint)}.` : "A whole number of points."}
              {limit !== null ? ` You can credit up to ${limit.toLocaleString("en-AU")} at once.` : ""}
            </p>
            {overLimit ? <p className="text-sm text-destructive">That's over your limit. Ask a manager to credit it.</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="credit-reason">Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as PointsCreditReason)}>
              <SelectTrigger id="credit-reason" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POINTS_CREDIT_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {POINTS_REASON_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="credit-order">Order</Label>
            <Select value={orderId} onValueChange={setOrderId}>
              <SelectTrigger id="credit-order" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ORDER}>Not about an order</SelectItem>
                {orders.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.orderNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="credit-note">Internal note{reason === "other" ? "" : " (optional)"}</Label>
            <Textarea id="credit-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
            <p className="text-sm text-muted-foreground">Only staff see this. The customer sees the reason.</p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={!canSubmit}>
            {credit.isPending ? "Crediting…" : n !== null ? `Credit ${n.toLocaleString("en-AU")} points` : "Credit points"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
