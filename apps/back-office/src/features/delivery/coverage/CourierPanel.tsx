import { useEffect, useState } from "react";

import { courierEstimateSentence, type CourierBlocker, type CourierReachDTO, type CourierReachUpdateDTO } from "@effy/shared-types";
import { Button, Input, Label, Switch } from "@effy/design-system/ui";

import { coverageError } from "../errorText";
import { useAddCourierExclusion, useRemoveCourierExclusion, useUpdateCourier } from "../queries";

/** What has to be done before courier delivery can be switched on — said before anyone tries. */
const BLOCKER_COPY: Record<CourierBlocker, string> = {
  no_fee_table: "Make a courier fee table active on the Pricing tab.",
  no_estimate: "Say how long a courier usually takes, below.",
};

/**
 * Courier reach (076 US4; 079): where an address NOT on Effy's list is offered courier delivery —
 * everywhere in the country except the places excluded here — what a customer is told about when it
 * arrives, and whether an address WITH Effy delivery may go by courier when no window is left.
 *
 * ⚠ SWITCHING IT ON PROMISES NOBODY ANYTHING BEFORE THE NEW DELIVERY MODEL IS ON. The coverage answer
 * itself says "courier" only once a courier order can be placed, so courier delivery can be set up
 * ahead of the cutover; the screen says it is waiting (`courier.pending`).
 *
 * ⚠ THE ESTIMATE IS SHOWN AS THE CUSTOMER WILL READ IT — the whole sentence, with "an estimate, not a
 * guaranteed date" on the end — because the field alone ("2–4 business days") reads like a promise.
 */
export function CourierPanel({ courier, canManage }: { courier: CourierReachDTO; canManage: boolean }) {
  const update = useUpdateCourier();
  const addExclusion = useAddCourierExclusion();
  const removeExclusion = useRemoveCourierExclusion();
  const [postcode, setPostcode] = useState("");
  const [reason, setReason] = useState("");
  const [estimate, setEstimate] = useState(courier.estimateText ?? "");
  const [error, setError] = useState<string | null>(null);

  // The saved estimate is the server's: when it changes there (this save, or someone else's, told to
  // us by the live channel), the field follows.
  useEffect(() => setEstimate(courier.estimateText ?? ""), [courier.estimateText]);

  async function change(c: CourierReachUpdateDTO) {
    setError(null);
    try {
      await update.mutateAsync(c);
    } catch (err) {
      setError(coverageError(err));
    }
  }

  async function exclude(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addExclusion.mutateAsync({ postcode: postcode.trim(), reason: reason.trim() });
      setPostcode(""); setReason("");
    } catch (err) {
      setError(coverageError(err));
    }
  }

  async function include(pc: string) {
    setError(null);
    try {
      await removeExclusion.mutateAsync(pc);
    } catch (err) {
      setError(coverageError(err));
    }
  }

  const typed = estimate.trim();
  const saved = courier.estimateText ?? "";
  // On needs a price and an estimate. Off is always allowed.
  const locked = !courier.offered && courier.blockedBy.length > 0;

  return (
    <section className="space-y-4" aria-labelledby="coverage-courier">
      <div className="space-y-1">
        <h2 id="coverage-courier" className="text-base font-semibold">Courier delivery</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          An address that is not on Effy's list is offered courier delivery — everywhere in the country except the postcodes excluded below.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Switch id="courier-offered" checked={courier.offered} disabled={!canManage || locked || update.isPending}
            onCheckedChange={(v) => void change({ offered: v })} />
          <Label htmlFor="courier-offered">Offer courier delivery</Label>
        </div>
        {locked ? (
          <div className="text-sm text-muted-foreground" data-testid="courier-locked">
            <p>Before courier delivery can be switched on:</p>
            <ul className="list-disc pl-5">
              {courier.blockedBy.map((b) => <li key={b}>{BLOCKER_COPY[b]}</li>)}
            </ul>
          </div>
        ) : null}
        {courier.pending ? (
          <p className="text-sm text-warning" data-testid="courier-pending">
            Switched on, and starts with the new delivery model. Until then an address off Effy's list is still told Effy can't deliver there.
          </p>
        ) : null}
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void change({ estimateText: typed === "" ? null : typed });
        }}
      >
        <Label htmlFor="courier-estimate">How long a courier usually takes</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input id="courier-estimate" className="w-64" placeholder="2–4 business days" maxLength={60} value={estimate}
            disabled={!canManage} onChange={(e) => setEstimate(e.target.value)} />
          {canManage ? (
            <Button type="submit" variant="outline" disabled={update.isPending || typed === saved || (typed === "" && courier.offered)}>
              Save
            </Button>
          ) : null}
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground" data-testid="courier-estimate-preview">
          {typed.length >= 3
            ? <>Customers read: “{courierEstimateSentence(typed)}” An order keeps the estimate it was sold.</>
            : "Customers are told this as an estimate, never as a promised date."}
        </p>
      </form>

      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <Switch id="courier-no-windows" checked={courier.whenNoWindows} disabled={!canManage || update.isPending}
            onCheckedChange={(v) => void change({ whenNoWindows: v })} />
          <Label htmlFor="courier-no-windows">Offer courier when no delivery window is available</Label>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          For an address Effy delivers to, when every window on every offered day is closed or taken. Off: the customer is told there are no windows and cannot pay.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Excluded postcodes</h3>
        {courier.exclusions.length === 0 ? (
          <p className="text-sm text-muted-foreground">None — courier delivery would be offered everywhere off Effy's list.</p>
        ) : (
          <ul className="divide-y rounded-md border text-sm" data-testid="courier-exclusions">
            {courier.exclusions.map((x) => (
              <li key={x.postcode} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="font-mono tabular-nums">{x.postcode}</span>
                <span className="text-muted-foreground">{x.places.slice(0, 3).join(", ")}</span>
                <span className="min-w-0 flex-1">{x.reason}</span>
                {canManage ? <Button variant="ghost" size="sm" disabled={removeExclusion.isPending} onClick={() => void include(x.postcode)}>Remove</Button> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage ? (
        <form onSubmit={exclude} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="exclude-postcode">Postcode</Label>
            <Input id="exclude-postcode" className="w-28" inputMode="numeric" placeholder="7255" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exclude-reason">Why</Label>
            <Input id="exclude-reason" className="w-72" placeholder="No chilled courier service" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" disabled={addExclusion.isPending || postcode.trim().length !== 4 || reason.trim().length < 3}>Exclude</Button>
        </form>
      ) : null}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </section>
  );
}
