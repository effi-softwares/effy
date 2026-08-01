import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import type { DeliveryPriceBandDTO, DeliveryPricingRuleDTO } from "@effy/shared-types";
import { Button, Input, Label } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { pricingMutationError } from "./errorText";
import { pricingRulesQuery, useReplacePricingRule } from "./queries";

/**
 * Delivery pricing rules (032 US1).
 *
 * ⚠ WHY THIS REPLACED A RATE GRID. 021 priced delivery per (origin zone → destination zone, method),
 * so the table grew as origins × destinations × methods and said nothing about how far anything
 * actually travelled or what it weighed. These are RULES: an admin states what delivery costs at each
 * distance and what weight adds, once, and every order is priced from them.
 *
 * ⚠ NO CARDS — a sectioned page of tables and detail rows, per the design doctrine.
 */
const METHODS = ["same_day", "scheduled", "standard"] as const;

const METHOD_LABEL: Record<string, string> = {
  same_day: "Same-day",
  scheduled: "Scheduled",
  standard: "Standard",
};

export function PricingRulesScreen() {
  const { data, error, isPending, isError, refetch } = useQuery(pricingRulesQuery());

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const byMethod = new Map(data.map((r) => [r.method, r]));

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Delivery pricing</h1>
        <p className="text-sm text-muted-foreground">
          What delivery costs, by how far a package travels and how much it weighs. Fees are always
          rounded <strong>up</strong> to the rounding step, then capped at the maximum.
        </p>
      </div>

      {METHODS.map((m) => (
        <RuleSection key={m} method={m} rule={byMethod.get(m) ?? null} />
      ))}
    </div>
  );
}

function RuleSection({ method, rule }: { method: string; rule: DeliveryPricingRuleDTO | null }) {
  const save = useReplacePricingRule(method);
  const [baseAmount, setBase] = useState(rule?.baseAmount ?? "0.00");
  const [roundingStep, setStep] = useState(rule?.roundingStep ?? "0.50");
  const [maxAmount, setMax] = useState(rule?.maxAmount ?? "45.00");
  const [distanceBands, setDistance] = useState<DeliveryPriceBandDTO[]>(rule?.distanceBands ?? []);
  const [weightBands, setWeight] = useState<DeliveryPriceBandDTO[]>(rule?.weightBands ?? []);
  const [enabled, setEnabled] = useState(rule ? rule.status === "active" : true);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!rule) return;
    setBase(rule.baseAmount);
    setStep(rule.roundingStep);
    setMax(rule.maxAmount);
    setDistance(rule.distanceBands);
    setWeight(rule.weightBands);
    setEnabled(rule.status === "active");
  }, [rule]);

  function onSave() {
    setFormError(null);
    save.mutate(
      {
        baseAmount,
        roundingStep,
        maxAmount,
        status: enabled ? "active" : "disabled",
        distanceBands,
        weightBands,
      },
      // ⚠ The refusal copy is the whole reason this handler exists. Each of the five refusals fails
      // SILENTLY in production if it is misunderstood, so "please check the fields" would be worse
      // than useless here.
      { onError: (err) => setFormError(pricingMutationError(err)) },
    );
  }

  const narrow = narrowestDistanceBand(distanceBands);

  return (
    <section className="space-y-4 border-t pt-6" data-testid={`rule-${method}`}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{METHOD_LABEL[method] ?? method}</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Offered
        </label>
      </div>

      {!rule && (
        <p className="text-sm text-muted-foreground" data-testid={`unconfigured-${method}`}>
          Not configured yet — this method still uses its old rate-grid price until a rule is saved.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${method}-base`}>Base</Label>
          <Input id={`${method}-base`} value={baseAmount} onChange={(e) => setBase(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${method}-step`}>Rounding step</Label>
          <Input id={`${method}-step`} value={roundingStep} onChange={(e) => setStep(e.target.value)} />
          <p className="text-xs text-muted-foreground">Fees round up to a multiple of this.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${method}-max`}>Maximum</Label>
          <Input id={`${method}-max`} value={maxAmount} onChange={(e) => setMax(e.target.value)} />
          <p className="text-xs text-muted-foreground">No fee can exceed this, however far or heavy.</p>
        </div>
      </div>

      <BandTable
        title="Distance bands"
        unit="km"
        idPrefix={`${method}-distance`}
        bands={distanceBands}
        onChange={setDistance}
      />

      {/* ⚠ BAND WIDTH IS A PRIVACY PARAMETER, NOT ONLY A PRICING ONE (FR-033a).
          A fee that rises with distance is, by construction, a signal about distance. What keeps that
          from identifying the shop is that a band spans many possible origins — so a very narrow band
          in a metro area can resolve to one fulfilment node, weakening hidden fulfilment. An admin
          narrowing bands would otherwise have no way of knowing that. */}
      {narrow !== null && narrow < 3 && (
        <p className="text-sm text-muted-foreground" data-testid={`narrow-band-warning-${method}`}>
          ⚠ Your narrowest distance band is {narrow} km. Bands this narrow can reveal roughly how far
          away the shop is, because only one of them could be serving that customer. Wider bands keep
          fulfilment private.
        </p>
      )}

      <BandTable
        title="Weight bands"
        unit="kg"
        idPrefix={`${method}-weight`}
        bands={weightBands}
        onChange={setWeight}
      />

      {formError && (
        <p role="alert" className="text-sm text-destructive" data-testid={`error-${method}`}>
          {formError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button size="sm" disabled={save.isPending} onClick={onSave}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        {rule && (
          <span className="text-xs text-muted-foreground">
            Last changed by {rule.updatedBy} on {new Date(rule.updatedAt).toLocaleDateString()}
          </span>
        )}
      </div>
    </section>
  );
}

function BandTable({
  title,
  unit,
  idPrefix,
  bands,
  onChange,
}: {
  title: string;
  unit: string;
  idPrefix: string;
  bands: DeliveryPriceBandDTO[];
  onChange: (b: DeliveryPriceBandDTO[]) => void;
}) {
  function set(i: number, patch: Partial<DeliveryPriceBandDTO>) {
    onChange(bands.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <table className="w-full text-sm" data-testid={`${idPrefix}-table`}>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {/* ⚠ "Up to", not "from" — bands are matched by smallest upper bound >= the value, and a
                value exactly on a bound takes THAT band. Labelling the column ambiguously is how an
                operator builds a table that prices every boundary one step high. */}
            <th className="py-1.5 font-medium">Up to ({unit})</th>
            <th className="py-1.5 font-medium">Adds</th>
            <th className="py-1.5" />
          </tr>
        </thead>
        <tbody>
          {bands.map((b, i) => (
            <tr key={i} className="border-b">
              <td className="py-1.5 pr-3">
                <Input
                  aria-label={`${title} ${i + 1} upper bound`}
                  value={b.upperBound}
                  onChange={(e) => set(i, { upperBound: e.target.value })}
                />
              </td>
              <td className="py-1.5 pr-3">
                <Input
                  aria-label={`${title} ${i + 1} amount`}
                  value={b.addAmount}
                  onChange={(e) => set(i, { addAmount: e.target.value })}
                />
              </td>
              <td className="py-1.5 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(bands.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </td>
            </tr>
          ))}
          {bands.length === 0 && (
            <tr>
              <td colSpan={3} className="py-2 text-muted-foreground">
                No bands — every order would be priced at the base amount.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange([...bands, { upperBound: "", addAmount: "0.00" }])}
      >
        Add band
      </Button>
    </div>
  );
}

/**
 * The narrowest span between consecutive distance bands (or the first band's own width).
 *
 * ⚠ Exported for its test: it is the input to a privacy warning, and getting it wrong means either
 * crying wolf on every save or never warning at all.
 */
export function narrowestDistanceBand(bands: DeliveryPriceBandDTO[]): number | null {
  const bounds = bands
    .map((b) => Number(b.upperBound))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (bounds.length === 0) return null;

  let narrowest = bounds[0]!; // the first band spans 0 → its bound
  for (let i = 1; i < bounds.length; i++) {
    narrowest = Math.min(narrowest, bounds[i]! - bounds[i - 1]!);
  }
  return narrowest;
}
