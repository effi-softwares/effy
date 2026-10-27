import {
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
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui";

interface Props {
  facts: ProductFacts;
  /** The leaf's defaults: a fact the shop has not changed shows "from category". */
  defaults: FactDefaults;
  touched: readonly FactKey[];
  onChange: (facts: ProductFacts, touched: FactKey[]) => void;
  disabled?: boolean;
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
}: Props) {
  const set = <K extends FactKey>(key: K, value: ProductFacts[K]) =>
    onChange(
      { ...facts, [key]: value },
      touched.includes(key) ? [...touched] : [...touched, key],
    );
  const origin = (key: FactKey) =>
    !touched.includes(key) &&
    defaults[key] !== null &&
    facts[key] === defaults[key] ? (
      <span className="text-xs font-normal text-muted-foreground">
        from category
      </span>
    ) : defaults[key] !== null && facts[key] !== defaults[key] ? (
      <span className="text-xs font-normal text-muted-foreground">
        changed — Effy reviews it
      </span>
    ) : null;

  return (
    <fieldset className="grid gap-4">
      <legend className="text-sm font-semibold">How it is kept and sold</legend>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label
            htmlFor="fact-storage"
            className="flex flex-wrap items-baseline gap-2"
          >
            Storage {origin("storage")}
          </Label>
          <Select
            value={facts.storage ?? ""}
            disabled={disabled}
            onValueChange={(v) => set("storage", v as Storage)}
          >
            <SelectTrigger id="fact-storage">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {STORAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STORAGE_WORDS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label
            htmlFor="fact-gst"
            className="flex flex-wrap items-baseline gap-2"
          >
            GST {origin("gstStatus")}
          </Label>
          <Select
            value={facts.gstStatus ?? ""}
            disabled={disabled}
            onValueChange={(v) => set("gstStatus", v as GstStatus)}
          >
            <SelectTrigger id="fact-gst">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gst_free">
                {GST_STATUS_WORDS.gst_free}
              </SelectItem>
              <SelectItem value="taxable">
                {GST_STATUS_WORDS.taxable}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label
            htmlFor="fact-age"
            className="flex flex-wrap items-baseline gap-2"
          >
            Age restriction {origin("ageRestricted")}
          </Label>
          <Select
            value={
              facts.ageRestricted === null ? "" : String(facts.ageRestricted)
            }
            disabled={disabled}
            onValueChange={(v) => set("ageRestricted", v === "true")}
          >
            <SelectTrigger id="fact-age">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="false">Not age-restricted</SelectItem>
              <SelectItem value="true">18+ only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        If you're not sure about GST, ask your accountant — Effy reviews it.
        Storage decides how drivers carry it.
      </p>
    </fieldset>
  );
}
