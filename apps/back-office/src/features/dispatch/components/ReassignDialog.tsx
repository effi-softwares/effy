import { useState } from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from "@effy/design-system/ui";

import { dispatchActionError, refusalReasons } from "../errorText";
import { useReassignRound } from "../queries";

interface Props {
  roundId: string;
  currentDriverName: string;
  expectedUpdatedAt: string;
  drivers: Array<{ driverId: string; driverName: string }>;
}

/**
 * Move a round to another driver (FR-029), refusing an ineligible one BY NAME (FR-034).
 *
 * ⚠ THE REFUSAL IS THE POINT OF THIS DIALOG. A dispatcher may override a PREFERENCE — the engine
 * merely ranked somebody lower — but may not override a FACT: unlicensed, stood down, or holding no
 * suitable vehicle. When the server refuses, it says which condition failed, and this renders that
 * rather than collapsing it to "not allowed". 053 found every console refusal collapsing exactly that
 * way, because the screen matched on `instanceof Error` and the api-client throws a plain object.
 */
export function ReassignDialog({ roundId, currentDriverName, expectedUpdatedAt, drivers }: Props) {
  const [open, setOpen] = useState(false);
  const [driverId, setDriverId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const reassign = useReassignRound(roundId);

  // ⚠ `mutate` WITH CALLBACKS, NOT `mutateAsync` IN A TRY/CATCH — the house pattern, and it is not a
  // style choice: a rejected `mutateAsync` is reported as an UNHANDLED rejection even when the caller
  // catches it, which fails the test run with the raw problem object and no stack.
  function submit() {
    setError(null);
    setReasons([]);
    reassign.mutate(
      { driverId, expectedUpdatedAt },
      {
        onSuccess: () => {
          setOpen(false);
          setDriverId("");
        },
        onError: (err) => {
          setError(dispatchActionError(err, "reassign"));
          setReasons(refusalReasons(err));
        },
      },
    );
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Reassign
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move this round to another driver</DialogTitle>
            <DialogDescription>
              {currentDriverName} holds it now. Anything they have already collected stays with them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reassign-driver">Driver</Label>
            <select
              id="reassign-driver"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
            >
              <option value="">Choose a driver…</option>
              {drivers.map((d) => (
                <option key={d.driverId} value={d.driverId}>
                  {d.driverName}
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <div role="alert" className="space-y-1 text-sm">
              <p className="font-medium text-destructive">{error}</p>
              {/* ⚠ The named conditions, straight from the server. Without these a dispatcher knows
                  only that it failed — not whether to renew a licence, issue a van, or pick somebody
                  else entirely. */}
              {reasons.length > 0 ? (
                <ul className="list-disc pl-5 text-muted-foreground">
                  {reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={driverId === "" || reassign.isPending}>
              {reassign.isPending ? "Moving…" : "Move the round"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
