import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label, RadioGroup, RadioGroupItem, Textarea,
} from "@effy/design-system/ui";

import { deliveryMoveError, deliveryMoveRefusalText } from "../errorText";
import { deliveryMovePreviewQuery, useDeliveryMove } from "../queries";

const key = (w: { slotId: string; date: string }) => `${w.slotId}|${w.date}`;

/**
 * "Deliver by Effy…" (081 US3) — a courier order back to Effy's drivers, before the courier has it.
 *
 * ⚠ ONLY WINDOWS THE ORDER COULD BE SOLD NOW (the server's list, from the checkout's own calendar and
 * rule). Staff cannot overfill a window. ⚠ No money moves: nothing is taken, and anything given when
 * the order went to courier stays with the customer.
 */
export function DeliverByEffyDialog({ orderId, open, onOpenChange }: { orderId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const preview = useQuery(deliveryMovePreviewQuery(orderId, "effy", open));
  const move = useDeliveryMove(orderId);
  const [reason, setReason] = useState("");
  const [window, setWindow] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) { setReason(""); setWindow(""); setError(null); setDone(false); }
  }, [open]);

  const p = preview.data;
  const chosen = p?.windows?.find((w) => key(w) === window);
  const canConfirm = !!p?.allowed && !!chosen && reason.trim() !== "" && !move.isPending;

  async function confirm() {
    if (!p || !chosen) return;
    setError(null);
    try {
      await move.mutateAsync({ to: "effy", reason: reason.trim(), window: { slotId: chosen.slotId, date: chosen.date }, expectedUpdatedAt: p.updatedAt });
      setDone(true);
    } catch (err) {
      setError(deliveryMoveError(err));
      await preview.refetch();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Deliver by Effy</DialogTitle>
          <DialogDescription>The order goes back to Effy&apos;s drivers in the window you choose. The customer is told and pays nothing more.</DialogDescription>
        </DialogHeader>

        {done ? (
          <p className="text-sm font-medium" role="status">Effy delivers this order again. The customer has been told.</p>
        ) : preview.isPending ? (
          <p className="text-sm text-muted-foreground">Finding open windows…</p>
        ) : !p ? (
          <p className="text-sm text-destructive" role="alert">{deliveryMoveError(preview.error)}</p>
        ) : !p.allowed ? (
          <p className="text-sm" role="alert">{deliveryMoveRefusalText(p.refusal?.code ?? "")}</p>
        ) : (p.windows ?? []).length === 0 ? (
          <p className="text-sm" role="alert">No delivery window is open with room in the next few days.</p>
        ) : (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Window</legend>
              <RadioGroup value={window} onValueChange={setWindow} aria-label="Window">
                {p.windows!.map((w) => (
                  <div key={key(w)} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem id={`win-${key(w)}`} value={key(w)} />
                    <Label htmlFor={`win-${key(w)}`} className="font-normal">{w.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor="back-reason">Why (staff only — the customer never sees this)</Label>
              <Textarea id="back-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
        )}

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

        <DialogFooter>
          {done ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={!canConfirm} onClick={() => void confirm()}>Deliver by Effy</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
