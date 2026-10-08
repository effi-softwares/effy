import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { DELIVERY_FEE_LINE_LABEL, type FeePlanKind, type FeePlanDTO, type FeeSimulationDTO } from "@effy/shared-types";
import { Button, Checkbox, Input, Label } from "@effy/design-system/ui";

import { slotsQuery, useSimulateFee } from "../queries";
import { pricingError } from "./gapText";

const SELECT = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/**
 * Try a plan (077 FR-025). Any plan — draft, active or retired — against a postcode, a weight, a
 * basket value and a window: the fee the customer would see, then every step that built it.
 *
 * ⚠ READ-ONLY, and open to customer-service agents: it is how a fee is explained on the phone.
 * ⚠ It does not add anything up. The service prices with the engine checkout uses; this shows it.
 */
export function FeeSimulator({ plans, kind }: { plans: FeePlanDTO[]; kind: FeePlanKind }) {
  const slots = useQuery({ ...slotsQuery(), enabled: kind === "effy" });
  const simulate = useSimulateFee();
  const [planId, setPlanId] = useState("");
  const [postcode, setPostcode] = useState("");
  const [kg, setKg] = useState("1");
  const [basket, setBasket] = useState("50.00");
  const [slotId, setSlotId] = useState("");
  const [today, setToday] = useState(true);
  const [result, setResult] = useState<FeeSimulationDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    try {
      setResult(await simulate.mutateAsync({
        planId: planId || null, postcode: postcode.trim(), grams: Math.round(Number(kg) * 1000), basketAmount: Number(basket || "0").toFixed(2),
        slotId: kind === "effy" && slotId ? slotId : null, windowIsToday: kind === "effy" && slotId !== "" && today,
        ...(kind === "courier" ? { forceKind: "courier" as const } : {}),
      }));
    } catch (err) {
      setError(pricingError(err));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={run} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="sim-plan">Plan</Label>
          <select id="sim-plan" className={SELECT} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">The one in force</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.state})</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sim-postcode">Postcode</Label>
            <Input id="sim-postcode" inputMode="numeric" maxLength={4} value={postcode} onChange={(e) => setPostcode(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-kg">Weight (kg)</Label>
            <Input id="sim-kg" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-basket">Basket ($)</Label>
            <Input id="sim-basket" inputMode="decimal" value={basket} onChange={(e) => setBasket(e.target.value)} />
          </div>
        </div>
        {kind === "effy" ? (
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sim-window">Window</Label>
              <select id="sim-window" className={SELECT} value={slotId} onChange={(e) => setSlotId(e.target.value)}>
                <option value="">None — a later day</option>
                {(slots.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.startTime}–{s.endTime}</option>)}
              </select>
            </div>
            <div className="flex h-9 items-center gap-2">
              <Checkbox id="sim-today" checked={today} disabled={!slotId} onCheckedChange={(v) => setToday(v === true)} />
              <Label htmlFor="sim-today" className="font-normal">The window is today</Label>
            </div>
          </div>
        ) : null}
        <Button type="submit" variant="outline" disabled={simulate.isPending || postcode.trim().length !== 4}>Work it out</Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </form>

      <div aria-live="polite" className="space-y-3 text-sm">
        {result ? (
          <>
            {result.note ? <p>{result.note}</p> : null}
            {result.fee ? (
              <>
                <div>
                  <p className="font-medium">What the customer sees</p>
                  <dl className="mt-1 divide-y border-y">
                    {result.fee.lines.map((l, i) => (
                      <div key={`${l.kind}-${i}`} className="flex justify-between py-1.5">
                        <dt>{DELIVERY_FEE_LINE_LABEL[l.kind]}</dt>
                        <dd className="tabular-nums">{l.amount.startsWith("-") ? `−$${l.amount.slice(1)}` : `$${l.amount}`}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between py-1.5 font-semibold">
                      <dt>Delivery total</dt>
                      <dd className="tabular-nums">${result.fee.totalAmount}</dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <p className="font-medium">How it was built{result.plan ? ` — ${result.plan.name}` : ""}</p>
                  <dl className="mt-1 divide-y border-y">
                    {result.steps.map((s, i) => (
                      <div key={`${s.label}-${i}`} className="grid grid-cols-[8rem_1fr_auto] gap-2 py-1.5">
                        <dt className="text-muted-foreground">{s.label}</dt>
                        <dd>{s.detail}</dd>
                        <dd className="tabular-nums">{s.amount.startsWith("-") ? `−$${s.amount.slice(1)}` : `$${s.amount}`}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground">Enter a postcode to see the fee and every step that built it.</p>
        )}
      </div>
    </div>
  );
}
