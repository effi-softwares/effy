import { useState } from "react";

import { courierEstimateSentence, type CourierBlocker, type CourierCollection, type CourierReachDTO, type CourierReachUpdateDTO } from "@effy/shared-types";
import { Button, Input, Label, RadioGroup, RadioGroupItem, Switch } from "@effy/design-system/ui";

import { coverageError } from "../errorText";
import { useAddCourierExclusion, useRemoveCourierExclusion, useUpdateCourier } from "../queries";
import { CourierServicesPanel } from "./CourierServicesPanel";

/** What has to be done before courier delivery can be switched on — said before anyone tries. */
const BLOCKER_COPY: Record<CourierBlocker, string> = {
  no_fee_table: "Make a courier fee table active on the Pricing tab.",
  no_service: "Add a courier service below and make it the default.",
  // Not returned since 080 — the default service carries the timeframe.
  no_estimate: "Add a courier service below and make it the default.",
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
 * ⚠ 080 — it is the DEFAULT COURIER SERVICE's timeframe now, edited on that service; 079's free-text
 * estimate field is gone from the console.
 */
export function CourierPanel({ courier, canManage }: { courier: CourierReachDTO; canManage: boolean }) {
  const update = useUpdateCourier();
  const addExclusion = useAddCourierExclusion();
  const removeExclusion = useRemoveCourierExclusion();
  const [postcode, setPostcode] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

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

      <div className="space-y-1" data-testid="courier-estimate-preview">
        <p className="text-sm font-medium">What a courier customer is told</p>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {courier.defaultService
            ? <>“{courierEstimateSentence(courier.defaultService.estimateText)}” — the timeframe of {courier.defaultService.label}, the default service. An order keeps the estimate it was sold.</>
            : "Nothing yet — checkout tells a courier customer the default courier service's timeframe."}
        </p>
      </div>

      <div className="space-y-2">
        <p id="courier-collection-label" className="text-sm font-medium">How courier parcels reach the courier</p>
        <RadioGroup aria-labelledby="courier-collection-label" value={courier.collectionDefault} disabled={!canManage || update.isPending}
          onValueChange={(v) => void change({ collectionDefault: v as CourierCollection })} className="gap-2">
          <label className="flex items-start gap-2 text-sm">
            <RadioGroupItem value="hub" aria-label="Via the hub" />
            <span><span className="font-medium">Via the hub</span> — Effy's drivers collect from suppliers, and the hub hands parcels to the courier.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <RadioGroupItem value="supplier" aria-label="Pickup from the supplier" />
            <span><span className="font-medium">Pickup from the supplier</span> — the courier collects each parcel from the supplier that packed it.</span>
          </label>
        </RadioGroup>
        <p className="max-w-2xl text-sm text-muted-foreground">For new courier orders. Staff can change a single order until its first parcel leaves.</p>
      </div>

      <CourierServicesPanel canManage={canManage} />

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
