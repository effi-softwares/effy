import { Box, Snowflake, Thermometer, type LucideIcon } from "lucide-react";

import {
  AGE_RESTRICTED_LABEL,
  GST_STATUS_WORDS,
  STORAGE_WORDS,
  STORAGES,
  type FactDefaults,
  type FactKey,
  type GstStatus,
  type ProductFacts,
  type Storage,
} from "@effy/shared-types";
import {
  Button,
  Label,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from "@effy/design-system/ui";
import { cn } from "@effy/design-system";

const STORAGE_ICON: Record<Storage, LucideIcon> = {
  frozen: Snowflake,
  chilled: Thermometer,
  ambient: Box,
};

interface Props {
  facts: ProductFacts;
  /** The leaf's defaults: a fact the shop has not changed shows "the category's default". */
  defaults: FactDefaults;
  touched: readonly FactKey[];
  onChange: (facts: ProductFacts, touched: FactKey[]) => void;
  disabled?: boolean;
  /** Its own heading; off where the page already heads it. */
  legend?: boolean;
}

/**
 * Storage, GST and 18+: fixed facts the platform acts on (cold chain, tax, age). Each starts from the
 * category's default; changing one is the shop's call, and Effy's review sees it.
 */
export function FactsSection({
  facts,
  defaults,
  touched,
  onChange,
  disabled,
  legend = true,
}: Props) {
  const set = <K extends FactKey>(key: K, value: ProductFacts[K]) =>
    onChange(
      { ...facts, [key]: value },
      touched.includes(key) ? [...touched] : [...touched, key],
    );
  const reset = (key: FactKey) =>
    onChange(
      { ...facts, [key]: defaults[key] },
      touched.filter((k) => k !== key),
    );
  const changed = (key: FactKey) =>
    defaults[key] !== null && facts[key] !== defaults[key];
  const origin = (key: FactKey) =>
    changed(key) ? (
      <span className="text-xs text-muted-foreground">
        Changed from the category&apos;s · Effy reviews it ·{" "}
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-xs"
          disabled={disabled}
          onClick={() => reset(key)}
        >
          Use the category&apos;s
        </Button>
      </span>
    ) : defaults[key] !== null ? (
      <span className="text-xs text-muted-foreground">The category&apos;s default</span>
    ) : null;

  return (
    <fieldset className="m-0 grid gap-0 border-0 p-0">
      <legend className={cn("mb-2 text-sm font-semibold", !legend && "sr-only")}>
        How it is kept and sold
      </legend>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3.5">
        <div className="grid gap-0.5">
          <Label id="fact-storage">Storage</Label>
          {origin("storage")}
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby="fact-storage"
          disabled={disabled}
          value={facts.storage ?? ""}
          onValueChange={(v) => v && set("storage", v as Storage)}
        >
          {STORAGES.map((s) => {
            const Icon = STORAGE_ICON[s];
            return (
              <ToggleGroupItem key={s} value={s} className="px-3">
                <Icon aria-hidden="true" />
                {STORAGE_WORDS[s]}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3.5">
        <div className="grid gap-0.5">
          <Label id="fact-gst">GST</Label>
          {origin("gstStatus")}
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby="fact-gst"
          disabled={disabled}
          value={facts.gstStatus ?? ""}
          onValueChange={(v) => v && set("gstStatus", v as GstStatus)}
        >
          {(["taxable", "gst_free"] as const).map((g) => (
            <ToggleGroupItem key={g} value={g} className="px-3">
              {GST_STATUS_WORDS[g]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 py-3.5">
        <div className="grid gap-0.5">
          <Label htmlFor="fact-age">{AGE_RESTRICTED_LABEL} only</Label>
          {origin("ageRestricted") ?? (
            <span className="text-xs text-muted-foreground">
              Shows an {AGE_RESTRICTED_LABEL} label.
            </span>
          )}
        </div>
        <Switch
          id="fact-age"
          checked={facts.ageRestricted === true}
          disabled={disabled}
          onCheckedChange={(on) => set("ageRestricted", on)}
        />
      </div>
      <p className="pt-1 text-xs text-muted-foreground">
        If you&apos;re not sure about GST, ask your accountant — Effy reviews it. Storage decides how
        drivers carry it.
      </p>
    </fieldset>
  );
}
