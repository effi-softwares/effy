import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label, RadioGroup, RadioGroupItem, Textarea,
} from "@effy/design-system/ui";

import { deliveryMoveError } from "../errorText";
import { deliveryMovePreviewQuery, useChangeDeliveryWindow } from "../queries";

const key = (w: { slotId: string; date: string }) => `${w.slotId}|${w.date}`;

/**
 * "Change day or time…" (085) — give an order Effy delivers another window, or a day with no time
 * (the "Any time" entries). A customer rang to ask for a time after all, or a day cannot be met.
 *
 * ⚠ ONLY WHAT THE ORDER COULD BE SOLD NOW — the same server list as "Deliver by Effy", from the
 * checkout's own calendar and rule. ⚠ No money moves and who delivers does not change. The customer's
 * order page says the new promise as soon as it is saved.
 */
export function ChangeDeliveryWindowDialog({ orderId, open, onOpenChange }: { orderId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const preview = useQuery(deliveryMovePreviewQuery(orderId, "effy", open));
  const change = useChangeDeliveryWindow(orderId);
  const [reason, setReason] = useState("");
  const [window, setWindow] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) { setReason(""); setWindow(""); setError(null); setDone(false); }
  }, [open]);

  const p = preview.data;
  const windows = p?.windows ?? [];
  const chosen = windows.find((w) => key(w) === window);
  const canConfirm = !!p && !!chosen && reason.trim() !== "" && !change.isPending;

  async function confirm() {
    if (!p || !chosen) return;
    setError(null);
    try {
      await change.mutateAsync({ window: { slotId: chosen.slotId, date: chosen.date }, reason: reason.trim(), expectedUpdatedAt: p.updatedAt });
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
          <DialogTitle>Change day or time</DialogTitle>
          <DialogDescription>
            Choose a window, or a day with “Any time” to promise the day without hours. No money moves; the customer&apos;s order page shows the new promise.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <p className="text-sm font-medium" role="status">Saved. The order&apos;s delivery has been changed.</p>
        ) : preview.isPending ? (
          <p className="text-sm text-muted-foreground">Finding open days and windows…</p>
        ) : !p ? (
          <p className="text-sm text-destructive" role="alert">{deliveryMoveError(preview.error)}</p>
        ) : windows.length === 0 ? (
          <p className="text-sm" role="alert">No day or window is open with room in the next few days.</p>
        ) : (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Day or window</legend>
              <RadioGroup value={window} onValueChange={setWindow} aria-label="Day or window">
                {windows.map((w) => (
                  <div key={key(w)} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem id={`retime-${key(w)}`} value={key(w)} />
                    <Label htmlFor={`retime-${key(w)}`} className={w.anyTime ? "font-medium" : "font-normal"}>{w.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor="retime-reason">Why (staff only — the customer never sees this)</Label>
              <Textarea id="retime-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
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
              <Button disabled={!canConfirm} onClick={() => void confirm()}>Save</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
