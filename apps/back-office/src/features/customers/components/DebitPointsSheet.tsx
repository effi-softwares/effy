import { useState } from "react";

import { POINTS_DEBIT_REASONS, POINTS_REASON_LABELS, type PointsDebitReason } from "@effy/shared-types";
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
import { useDebitPoints } from "../queries";
import { formatPointsValue, parsePoints } from "./points-format";

/**
 * Remove points to correct a balance (074 US5) — admin and manager only, and the server says so too.
 *
 * ⚠ NOTHING IS EDITED OR DELETED. A debit is a new line in the history beside the credit it corrects;
 * the customer sees "Balance correction".
 */
export function DebitPointsSheet({
  open,
  onOpenChange,
  customerId,
  customerName,
  usable,
  centsPerPoint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  usable: number;
  centsPerPoint: number;
}) {
  const debit = useDebitPoints(customerId);
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState<PointsDebitReason>("credited_in_error");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const n = parsePoints(points);
  const tooMany = n !== null && n > usable;
  const canSubmit = n !== null && !tooMany && !(reason === "other" && note.trim() === "") && !debit.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Remove points</SheetTitle>
          <SheetDescription>
            {customerName} · {usable.toLocaleString("en-AU")} usable
          </SheetDescription>
        </SheetHeader>

        <form
          className="space-y-4 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (n === null) return;
            setError(null);
            debit.mutate(
              { points: n, reason, note: note.trim() },
              {
                onSuccess: () => {
                  toast(`${n.toLocaleString("en-AU")} points removed from ${customerName}.`);
                  setPoints("");
                  setNote("");
                  onOpenChange(false);
                },
                onError: (err) => setError(pointsActionError(err)),
              },
            );
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="debit-points">Points</Label>
            <Input id="debit-points" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} autoFocus />
            <p className="text-sm text-muted-foreground">{n !== null ? `Worth ${formatPointsValue(n, centsPerPoint)}.` : "A whole number of points."}</p>
            {tooMany ? <p className="text-sm text-destructive">They only have {usable.toLocaleString("en-AU")} usable points.</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="debit-reason">Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as PointsDebitReason)}>
              <SelectTrigger id="debit-reason" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POINTS_DEBIT_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {POINTS_REASON_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="debit-note">Internal note{reason === "other" ? "" : " (optional)"}</Label>
            <Textarea id="debit-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="destructive" disabled={!canSubmit}>
            {debit.isPending ? "Removing…" : n !== null ? `Remove ${n.toLocaleString("en-AU")} points` : "Remove points"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
