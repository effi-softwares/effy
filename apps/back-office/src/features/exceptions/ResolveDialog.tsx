import { useState } from "react";

import { cn } from "@effy/design-system";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "@effy/design-system/ui";
import { EXCEPTION_OUTCOMES, type DeliveryExceptionDTO, type ExceptionOutcome } from "@effy/shared-types";

import { Callout } from "@effy/web-kit/patterns";

import { exceptionMutationError } from "./errorText";
import { reasonLabel } from "./model";
import { useResolveException } from "./queries";

/** How a failed delivery ended, in the words staff use (board "Mark dealt with — outcome"). */
export const OUTCOME_WORDS: Record<ExceptionOutcome, { label: string; hint: string }> = {
  redelivered: { label: "Redelivered", hint: "Given a new window from the order page" },
  refunded: { label: "Refunded", hint: "The customer has their money back" },
  collected: { label: "Customer collected", hint: "Picked up from the hub" },
  other: { label: "Other", hint: "Say what happened below" },
};

/**
 * Closing a failed delivery: say how it ended so the next person doesn't have to ask. The outcome and
 * the note are kept on the failure; "Other" needs words.
 */
export function ResolveDialog({ exception: e, disabled }: { exception: DeliveryExceptionDTO; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<ExceptionOutcome | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resolve = useResolveException();

  const ready = outcome !== null && (outcome !== "other" || note.trim().length > 0);

  async function confirm() {
    setError(null);
    try {
      await resolve.mutateAsync({ id: e.exceptionId, note: note.trim() || null, outcome });
      setOpen(false);
    } catch (err) {
      setError(exceptionMutationError(err));
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => {
          setOutcome(null);
          setNote("");
          setError(null);
          setOpen(true);
        }}
      >
        Mark dealt with
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Mark {e.orderNumber} dealt with</DialogTitle>
            <DialogDescription>
              {reasonLabel(e.reason)} · {e.driverName} · the parcel is at the hub. Say how it ended so the next person doesn't have to ask.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Outcome</legend>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {EXCEPTION_OUTCOMES.map((o) => (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={outcome === o}
                  onClick={() => setOutcome(o)}
                  className={cn("bo-choice-card flex-col gap-0.5! text-left", outcome === o && "is-checked")}
                >
                  <span className="text-sm font-medium">{OUTCOME_WORDS[o].label}</span>
                  <span className="text-xs text-muted-foreground">{OUTCOME_WORDS[o].hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="resolve-note">{outcome === "other" ? "What happened" : "Note (optional)"}</Label>
            <Textarea id="resolve-note" value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={500} rows={3} />
          </div>
          {error ? <Callout tone="destructive" title={error} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={resolve.isPending}>
              Cancel
            </Button>
            <Button onClick={() => void confirm()} disabled={!ready || resolve.isPending}>
              {resolve.isPending ? "Saving…" : "Mark dealt with"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
