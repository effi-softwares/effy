import { useState } from "react";

import type { CourierReachDTO } from "@effy/shared-types";
import { Button, Input, Label, Switch } from "@effy/design-system/ui";

import { coverageError } from "../errorText";
import { useAddCourierExclusion, useRemoveCourierExclusion, useSetCourierOffered } from "../queries";

/**
 * Courier reach (076 US4): where an address NOT on Effy's list is offered courier delivery —
 * everywhere in the country except the places excluded here.
 *
 * ⚠ THE SWITCH IS LOCKED until a customer can actually place a courier order. Turned on before
 * then, every address in the country would be told "Courier delivery" by a checkout that cannot
 * sell one. The service refuses it too; this just says so before anyone tries. Exclusions can be
 * kept ready in the meantime.
 */
export function CourierPanel({ courier, canManage }: { courier: CourierReachDTO; canManage: boolean }) {
  const setOffered = useSetCourierOffered();
  const addExclusion = useAddCourierExclusion();
  const removeExclusion = useRemoveCourierExclusion();
  const [postcode, setPostcode] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function toggle(offered: boolean) {
    setError(null);
    try {
      await setOffered.mutateAsync(offered);
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

  const locked = !courier.canBeOffered && !courier.offered;

  return (
    <section className="space-y-3" aria-labelledby="coverage-courier">
      <div className="space-y-1">
        <h2 id="coverage-courier" className="text-base font-semibold">Courier delivery</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          An address that is not on Effy's list is offered courier delivery — everywhere in the country except the postcodes excluded below.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Switch id="courier-offered" checked={courier.offered} disabled={!canManage || locked || setOffered.isPending}
          onCheckedChange={(v) => void toggle(v)} />
        <Label htmlFor="courier-offered">Offer courier delivery</Label>
      </div>
      {locked ? (
        <p className="text-sm text-muted-foreground" data-testid="courier-locked">
          Courier delivery can be switched on once customers can place courier orders. Until then an address off Effy's list is told Effy can't deliver there.
        </p>
      ) : null}

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
