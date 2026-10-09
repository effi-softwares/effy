import { useState } from "react";

import type { GoLiveSwitch } from "@effy/shared-types";
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea,
} from "@effy/design-system/ui";

import { goLiveError } from "../errorText";
import { useSetGoLiveSwitch } from "../queries";
import { melbourneMoment } from "./words";

const STATE_WORDS: Record<GoLiveSwitch["state"], string> = {
  off: "Off — customers are sold the old way",
  scheduled: "Scheduled",
  on: "On — every new order is Delivered by Effy or Courier delivery",
};

/**
 * The switch to the new delivery model (083 US2).
 *
 * ⚠ ADMIN ONLY — everyone else reads the state and sees no control. The service decides again from
 * the staff record, and refuses while the checklist has a required item not ready.
 * ⚠ EVERY REQUEST CARRIES WHAT THIS PAGE SHOWED (`expected`): two admins at once cannot overwrite
 * each other; the second is told and shown what the first set.
 */
export function SwitchControl({ sw, ready, canSwitch }: { sw: GoLiveSwitch; ready: boolean; canSwitch: boolean }) {
  const set = useSetGoLiveSwitch();
  const [when, setWhen] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"now" | "off" | null>(null);
  const [reason, setReason] = useState("");

  async function send(at: string | null, why?: string) {
    setError(null);
    try {
      await set.mutateAsync({ at, expected: sw.at, reason: why ?? null });
      setWhen(""); setReason(""); setConfirm(null);
    } catch (err) {
      setError(goLiveError(err));
      setConfirm(null);
    }
  }

  // The field is the browser's local time; what is stored — and shown back — is the instant.
  const chosen = when ? new Date(when) : null;
  const validWhen = chosen !== null && !Number.isNaN(chosen.getTime());

  return (
    <section className="space-y-3" aria-labelledby="golive-switch">
      <h2 id="golive-switch" className="text-base font-semibold">The switch</h2>
      <dl className="grid max-w-2xl grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">State</dt>
        <dd data-testid="switch-state">{STATE_WORDS[sw.state]}</dd>
        {sw.at ? (
          <>
            <dt className="text-muted-foreground">{sw.state === "scheduled" ? "Starts" : "Started"}</dt>
            <dd data-testid="switch-at">{melbourneMoment(sw.at)}</dd>
          </>
        ) : null}
        {sw.setBy ? (
          <>
            <dt className="text-muted-foreground">Set by</dt>
            <dd>{sw.setBy}{sw.setAt ? `, ${melbourneMoment(sw.setAt)}` : ""}</dd>
          </>
        ) : null}
        {sw.removedAt ? (
          <>
            <dt className="text-muted-foreground">Old arrangement</dt>
            <dd>Removed {melbourneMoment(sw.removedAt)} — the new model is on for good.</dd>
          </>
        ) : null}
      </dl>

      {!canSwitch ? (
        <p className="text-sm text-muted-foreground" data-testid="switch-readonly">Only an administrator can set or change the switch.</p>
      ) : sw.removedAt ? null : sw.state === "on" ? (
        sw.canTurnBack ? <Button variant="outline" onClick={() => setConfirm("off")}>Turn back off…</Button> : null
      ) : (
        <div className="space-y-3">
          {!ready ? (
            <p className="text-sm text-muted-foreground" data-testid="switch-locked">
              The switch cannot be set until every required item above is ready.
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="golive-when">{sw.state === "scheduled" ? "A different date and time" : "Date and time"} (this computer's clock)</Label>
              <Input id="golive-when" type="datetime-local" className="w-60" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <Button disabled={!ready || !validWhen || set.isPending} onClick={() => void send(chosen!.toISOString())}>
              {sw.state === "scheduled" ? "Change" : "Schedule"}
            </Button>
            <Button variant="outline" disabled={!ready || set.isPending} onClick={() => setConfirm("now")}>Switch now…</Button>
            {sw.state === "scheduled" ? (
              <Button variant="ghost" disabled={set.isPending} onClick={() => void send(null)}>Cancel the scheduled switch</Button>
            ) : null}
          </div>
          {validWhen ? <p className="text-sm text-muted-foreground" data-testid="switch-preview">That is {melbourneMoment(chosen!.toISOString())}.</p> : null}
        </div>
      )}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

      <Dialog open={confirm === "now"} onOpenChange={(o) => (o ? null : setConfirm(null))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Switch to the new delivery model now?</DialogTitle>
            <DialogDescription>
              From this moment every new order is Delivered by Effy — a window today or on one of the next delivery days —
              or Courier delivery. Orders already placed keep exactly what they were sold and finish that way.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Not now</Button>
            <Button disabled={set.isPending} onClick={() => void send("now")}>Switch now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm === "off"} onOpenChange={(o) => (o ? null : setConfirm(null))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Turn the new delivery model back off?</DialogTitle>
            <DialogDescription>
              New orders go back to being sold the old way. Orders placed while the new model was on keep what they were
              sold — their window, their courier — and are delivered that way; nothing about them changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="golive-reason">Why</Label>
            <Textarea id="golive-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Keep it on</Button>
            <Button variant="destructive" disabled={set.isPending || reason.trim() === ""} onClick={() => void send(null, reason.trim())}>
              Turn back off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
