import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label,
} from "@effy/design-system/ui";

import { deliveryMutationError } from "../errorText";
import { ringsQuery, useCreatePlan } from "../queries";
import type { WeightBandBody } from "../repo";

// Create an inactive shipping-fee plan (047). Prices every ring + defines weight slabs; the same-day
// factor must be ≥ the standard factor (a≥b) and cap/floor must be multiples of the step — the backend
// re-checks all of it. The plan is created inactive; activate it from the Plans list.
export function NewPlanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreatePlan();
  const { data: rings } = useQuery(ringsQuery());
  const [name, setName] = useState("");
  const [roundingStep, setStep] = useState("0.50");
  const [floorAmount, setFloor] = useState("4.00");
  const [capAmount, setCap] = useState("40.00");
  const [standardFactor, setStd] = useState("1.000");
  const [sameDayFactor, setSame] = useState("1.800");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [bands, setBands] = useState<{ upperGrams: string; addAmount: string }[]>([
    { upperGrams: "2000", addAmount: "0.00" },
  ]);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const activeRings = rings ?? [];
    if (activeRings.some((r) => !prices[r.id]?.trim())) {
      setError("Price every ring — a plan that leaves one unpriced cannot be activated.");
      return;
    }
    const weightBands: WeightBandBody[] = bands
      .filter((b) => b.upperGrams.trim())
      .map((b) => ({ upperGrams: Number(b.upperGrams), addAmount: b.addAmount.trim() || "0.00" }));
    try {
      await create.mutateAsync({
        name: name.trim(),
        roundingStep, floorAmount, capAmount, sameDayFactor, standardFactor,
        ringPrices: activeRings.map((r) => ({ ringId: r.id, priceAmount: prices[r.id]!.trim() })),
        weightBands,
      });
      onOpenChange(false);
    } catch (err) {
      setError(deliveryMutationError(err, "A plan with that name already exists."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New shipping-fee plan</DialogTitle>
          <DialogDescription>
            Fee = method factor × (ring price + weight add), snapped up to the step, floored and capped.
            Created inactive — activate it from the list.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="plan-name">Name</Label>
            <Input id="plan-name" autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Launch" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Rounding step" value={roundingStep} onChange={setStep} />
            <Field label="Floor" value={floorAmount} onChange={setFloor} />
            <Field label="Cap" value={capAmount} onChange={setCap} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Standard factor (b)" value={standardFactor} onChange={setStd} />
            <Field label="Same-day factor (a ≥ b)" value={sameDayFactor} onChange={setSame} />
          </div>

          <div className="space-y-2">
            <Label>Ring prices</Label>
            {(rings ?? []).map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="w-40 text-sm text-muted-foreground">{r.name} ({r.code})</span>
                <Input inputMode="decimal" value={prices[r.id] ?? ""} placeholder="6.00"
                  onChange={(e) => setPrices((p) => ({ ...p, [r.id]: e.target.value }))} />
              </div>
            ))}
            {(rings ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Create at least one ring first.</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Weight slabs (grams ≤ → add)</Label>
              <Button type="button" variant="outline" size="sm"
                onClick={() => setBands((b) => [...b, { upperGrams: "", addAmount: "0.00" }])}>
                <Plus /> Add slab
              </Button>
            </div>
            {bands.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input inputMode="numeric" className="w-32" placeholder="grams ≤" value={b.upperGrams}
                  onChange={(e) => setBands((rows) => rows.map((r, j) => (j === i ? { ...r, upperGrams: e.target.value } : r)))} />
                <Input inputMode="decimal" placeholder="add $" value={b.addAmount}
                  onChange={(e) => setBands((rows) => rows.map((r, j) => (j === i ? { ...r, addAmount: e.target.value } : r)))} />
                <Button type="button" variant="ghost" size="icon" onClick={() => setBands((rows) => rows.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || (rings ?? []).length === 0}>Create plan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input inputMode="decimal" required value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
