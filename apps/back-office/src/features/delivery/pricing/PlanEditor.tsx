import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import type { FeePlanKind, FeePlanDTO } from "@effy/shared-types";
import {
  Button, Input, Label, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@effy/design-system/ui";

import { slotsQuery, useSavePlan } from "../queries";
import { GapList } from "./GapList";
import { planFieldErrors, pricingError } from "./gapText";
import { draftFrom, emptyDraft, toInput, type PlanDraft } from "./planDraft";

/**
 * Build or read one fee plan (077). A SECTIONED PAGE in a side sheet, not cards: amounts · distance
 * bands · weight bands · basket rules · surcharges — each a short heading and its fields.
 *
 * ⚠ READ-ONLY for an active or retired plan and for a customer-service agent. Those see the same
 * sections with every field disabled and, for a manager, "Copy to new draft".
 * ⚠ SAVING IS NOT ACTIVATING. A half-built draft may be saved; what it is missing is listed at the
 * top, in the console's own words, and activation is a separate, deliberate step.
 */
export function PlanEditor({
  kind, source, copy, canManage, onClose,
}: {
  kind: FeePlanKind;
  source: FeePlanDTO | null;
  copy: boolean;
  canManage: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<PlanDraft>(() => (source ? draftFrom(source, copy) : emptyDraft(kind)));
  const [planId, setPlanId] = useState<string | null>(source && !copy ? source.id : null);
  const [saved, setSaved] = useState<FeePlanDTO | null>(source && !copy ? source : null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const save = useSavePlan();
  const slots = useQuery({ ...slotsQuery(), enabled: kind === "effy" });

  const editable = canManage && (saved === null || saved.state === "draft");
  const set = (patch: Partial<PlanDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const fieldError = (name: string) => (fields[name] ? <p className="text-sm text-destructive">{fields[name]}</p> : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    try {
      const plan = await save.mutateAsync({ id: planId, body: toInput(kind, draft) });
      setPlanId(plan.id);
      setSaved(plan);
    } catch (err) {
      setFields(planFieldErrors(err));
      setError(pricingError(err));
    }
  }

  const title = saved ? saved.name : kind === "courier" ? "New courier table" : "New fee plan";
  const amount = (id: keyof PlanDraft, label: string, help?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`plan-${id}`}>{label}</Label>
      <Input
        id={`plan-${id}`} inputMode="decimal" disabled={!editable}
        value={draft[id] as string} onChange={(e) => set({ [id]: e.target.value } as Partial<PlanDraft>)}
      />
      {help ? <p className="text-sm text-muted-foreground">{help}</p> : null}
      {fieldError(id)}
    </div>
  );

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {saved?.state === "active" ? "In force. A plan that has been active can't be changed — copy it to a new draft."
              : saved?.state === "retired" ? "Retired. Kept as the record of what was charged while it was in force."
              : "A draft. Saving does not change any fee; activating does."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="space-y-8 px-4 pb-4">
          {saved && saved.state === "draft" ? <GapList gaps={saved.gaps} /> : null}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Amounts</h3>
            <div className="space-y-1.5">
              <Label htmlFor="plan-name">Name</Label>
              <Input id="plan-name" disabled={!editable} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
              {fieldError("name")}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {amount("baseAmount", kind === "courier" ? "Flat amount per order" : "Base", kind === "effy" ? "Every delivery starts here." : undefined)}
              {amount("roundingStepAmount", "Round up to", "Every fee is rounded UP to a multiple of this.")}
              {amount("floorAmount", "Minimum fee")}
              {amount("capAmount", "Maximum fee")}
            </div>
          </section>

          {kind === "effy" ? (
            <BandsSection
              title="Distance bands"
              help="From the hub, straight line. Leave the last band's limit empty: it prices everything beyond."
              unit="km"
              rows={draft.distanceBands.map((b) => ({ upper: b.upperKm, add: b.addAmount }))}
              editable={editable}
              lastOpenLabel="and beyond"
              error={fields.distanceBands}
              onChange={(rows) => set({ distanceBands: rows.map((r) => ({ upperKm: r.upper, addAmount: r.add })) })}
            />
          ) : null}

          <BandsSection
            title="Weight bands"
            help="The whole basket's weight. The heaviest band also prices everything above it."
            unit="kg"
            rows={draft.weightBands.map((b) => ({ upper: b.upperKg, add: b.addAmount }))}
            editable={editable}
            lastOpenLabel="and above"
            error={fields.weightBands}
            onChange={(rows) => set({ weightBands: rows.map((r) => ({ upperKg: r.upper, addAmount: r.add })) })}
          />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Basket rules</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {amount(
                "freeOverAmount",
                kind === "courier" ? "Free courier delivery over (optional)" : "Free delivery over (optional)",
                kind === "courier"
                  ? "Off unless set. Effy's free-delivery amount never applies to courier orders."
                  : "Goods after promotions. Waives the whole delivery charge, window surcharge included.",
              )}
              {kind === "effy" ? (
                <>
                  {amount("smallOrderUnderAmount", "Small-order fee under (optional)")}
                  {amount("smallOrderFeeAmount", "Small-order fee", "Shown to the customer as its own line.")}
                </>
              ) : null}
            </div>
          </section>

          {kind === "effy" ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Window surcharges</h3>
              <p className="text-sm text-muted-foreground">
                Belong to this plan, not to the windows: replacing the plan never changes a window. A
                customer sees a window's surcharge before choosing it.
              </p>
              {amount("todayPremiumAmount", "Delivery today", "Added to any window today — what makes same-day a bit dearer.")}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 font-normal">Window</th>
                    <th className="py-1 font-normal">Adds (any day)</th>
                  </tr>
                </thead>
                <tbody>
                  {(slots.data ?? []).map((s, i) => (
                    <tr key={s.id} className="border-t">
                      <td className="py-1.5 font-mono tabular-nums">
                        {s.startTime}–{s.endTime}
                        {s.status !== "active" ? <span className="ml-2 font-sans text-muted-foreground">switched off</span> : null}
                      </td>
                      <td className="py-1.5">
                        <Input
                          aria-label={`Surcharge for ${s.startTime}–${s.endTime}`}
                          inputMode="decimal" className="w-28" disabled={!editable} placeholder="0.00"
                          value={draft.slotPremiums[s.id] ?? ""}
                          onChange={(e) => set({ slotPremiums: { ...draft.slotPremiums, [s.id]: e.target.value } })}
                        />
                        {fieldError(`slotPremiums.${i}.addAmount`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {fieldError("slotPremiums")}
            </section>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <SheetFooter className="flex-row justify-end gap-2 p-0">
            <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
            {editable ? <Button type="submit" disabled={save.isPending}>{planId ? "Save draft" : "Create draft"}</Button> : null}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** One band table. The last row is labelled for what it does when its limit is left empty. */
function BandsSection({
  title, help, unit, rows, editable, lastOpenLabel, error, onChange,
}: {
  title: string;
  help: string;
  unit: string;
  rows: { upper: string; add: string }[];
  editable: boolean;
  lastOpenLabel: string;
  error?: string;
  onChange: (rows: { upper: string; add: string }[]) => void;
}) {
  const update = (i: number, patch: Partial<{ upper: string; add: string }>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{help}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 font-normal">Up to ({unit})</th>
            <th className="py-1 font-normal">Adds</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="py-1.5 pr-2">
                <Input
                  aria-label={`${title} ${i + 1} up to`} inputMode="decimal" className="w-32" disabled={!editable}
                  placeholder={i === rows.length - 1 ? lastOpenLabel : ""} value={r.upper}
                  onChange={(e) => update(i, { upper: e.target.value })}
                />
              </td>
              <td className="py-1.5 pr-2">
                <Input
                  aria-label={`${title} ${i + 1} adds`} inputMode="decimal" className="w-28" disabled={!editable}
                  value={r.add} onChange={(e) => update(i, { add: e.target.value })}
                />
              </td>
              <td className="py-1.5 text-right">
                {editable ? (
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${title.toLowerCase()} ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editable ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { upper: "", add: "" }])}>
          <Plus /> Add band
        </Button>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
