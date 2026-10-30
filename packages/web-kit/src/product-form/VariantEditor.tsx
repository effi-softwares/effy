import { Fragment, useState } from "react";

import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";

import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui";
import {
  PACK_UNIT_LABELS,
  UNIT_BASES,
  UNIT_BASIS_LABELS,
  VARIANT_LIMITS,
  unitPriceText,
  type CategoryFormRow,
  type OptionInputDTO,
  type UnitBasis,
} from "@effy/shared-types";

import { EditorSection, FieldError, FormField, MoneyInput } from "./fields";
import { TableFrame, Td, Th } from "./table";

import {
  addMissingRows,
  applyToAll,
  newId,
  optionAttributes,
  previewUnitPrice,
  rowLabel,
  syncRows,
  unitsFor,
  type VariantRowDraft,
  type VariantSetDraft,
} from "./variants";

interface VariantEditorProps {
  value: VariantSetDraft;
  onChange: (next: VariantSetDraft) => void;
  /** The leaf's form: which attributes may be options, and their values' labels. */
  rows: readonly CategoryFormRow[];
  errors: Record<string, string>;
  showErrors: boolean;
  media?: { storageKey: string; url: string; altText: string | null }[];
  disabled?: boolean;
  /** Whose price this is: "Your price" for a shop, "Shop's price" for Effy. */
  priceLabel?: string;
  priceHelp?: string;
}

const NONE = "__none__";

export function VariantEditor({
  value,
  onChange,
  rows,
  errors,
  showErrors,
  media,
  disabled,
  priceLabel = "Your price",
  priceHelp = "What Effy pays you. Effy sets what shoppers pay",
}: VariantEditorProps) {
  // "Several" can be chosen before the first option is added.
  const [several, setSeveral] = useState(value.options.length > 0);
  // Variants whose codes and shipping are showing.
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set());
  const toggleRow = (id: string) =>
    setOpenRows((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const leave = (path: string) => () =>
    setLeft((s) => (s.has(path) ? s : new Set(s).add(path)));
  const err = (path: string) =>
    showErrors || left.has(path) ? errors[path] : undefined;

  function setOptions(next: OptionInputDTO[]) {
    const options = next.map((o, i) => ({ ...o, position: i + 1 }));
    onChange({
      ...value,
      options,
      variants: syncRows(value.options, options, value.variants),
    });
  }
  const label = (r: VariantRowDraft) => rowLabel(value, r, rows);
  // The only options there are: the attributes the category offers as options (105), each with a few values.
  const offered = optionAttributes(rows);
  const used = new Set(value.options.map((o) => o.attributeId));
  const examples = (labels: readonly string[]) =>
    labels.slice(0, 3).join(", ") + (labels.length > 3 ? "…" : "");
  const choices = offered
    .filter((r) => !used.has(r.attributeId))
    .map((r) => ({ key: r.attributeId, label: r.name, hint: examples(r.values.map((v) => v.label)) }));
  function patchRow(i: number, patch: Partial<VariantRowDraft>) {
    onChange({
      ...value,
      variants: value.variants.map((r, j) =>
        j === i ? { ...r, ...patch } : r,
      ),
    });
  }
  function removeRow(i: number) {
    onChange({
      ...value,
      variants: value.variants
        .filter((_, j) => j !== i)
        .map((r, j) => ({ ...r, position: j })),
    });
  }

  const hasOptions = value.options.length > 0;
  const many = value.variants.length > 1;
  const missing =
    hasOptions && addMissingRows(value).length > value.variants.length;
  const showSeveral = several || hasOptions;
  // A category with no option attributes sells every product as one item (a product that already has
  // options keeps them editable).
  const noOptions = offered.length === 0 && !hasOptions;
  // With a unit-price basis set, variants with no net quantity show no unit price: say how many.
  const missingQuantity =
    value.unitBasis === "" ? 0 : value.variants.filter((r) => r.packUnit === "" || r.packQuantity.trim() === "").length;
  // Variants are listed once every option has a value; before that a row would only say "The product".
  const ready = hasOptions && value.options.every((o) => o.values.length > 0);
  const one = value.variants[0];
  const oneCell = (field: string) => err(`variants[0].${field}`);
  const oneUnit = one ? previewUnitPrice(value, one) : null;

  /** The product's unit price: one basis for every variant, worked out from each one's net quantity. */
  const unitPriceField = (help: string) => (
    <FormField id="v-basis" label="Unit price" optional help={help} error={err("unitBasis")}>
      <Select
        value={value.unitBasis === "" ? NONE : value.unitBasis}
        onValueChange={(v) => onChange({ ...value, unitBasis: v === NONE ? "" : (v as UnitBasis) })}
        disabled={disabled}
      >
        <SelectTrigger id="v-basis" className="w-full max-w-90">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Don&apos;t show one</SelectItem>
          {UNIT_BASES.map((b) => (
            <SelectItem key={b} value={b}>
              {UNIT_BASIS_LABELS[b]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );

  return (
    <div className="ef-editor__body">
      <EditorSection>
        <RadioGroup
          aria-label="How it is sold"
          value={showSeveral ? "several" : "one"}
          disabled={disabled}
          onValueChange={(v) => {
            if (v === "one") {
              setSeveral(false);
              if (hasOptions) setOptions([]);
            } else setSeveral(true);
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          {(
            [
              ["one", "No variants", "One price, nothing to choose. Most products are sold this way."],
              [
                "several",
                "With variants",
                noOptions
                  ? "This category has no options to choose between. Ask Effy to add one."
                  : `Shoppers choose an option — ${offered.map((r) => r.name.toLowerCase()).slice(0, 3).join(", ")} — each with its own price.`,
              ],
            ] as const
          ).map(([v, title, text]) => (
            <Label
              key={v}
              htmlFor={`v-sold-${v}`}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal transition-colors hover:bg-accent/50 has-data-[state=checked]:border-primary-fill has-data-[state=checked]:bg-primary-muted has-disabled:cursor-not-allowed has-disabled:opacity-60 has-disabled:hover:bg-transparent"
            >
              <RadioGroupItem
                id={`v-sold-${v}`}
                value={v}
                className="mt-0.5"
                disabled={v === "several" && noOptions}
              />
              <span className="grid gap-0.5">
                <span className="font-semibold">{title}</span>
                <span className="text-sm text-muted-foreground">{text}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </EditorSection>

      {showSeveral ? (
        <>
          <EditorSection
            title="Options"
            description={`What shoppers choose between, up to ${VARIANT_LIMITS.options}. Each combination you keep is sold as its own item, with its own price and stock.`}
          >
            {value.options.map((o, i) => (
              <OptionRow
                key={o.id}
                option={o}
                index={i}
                row={rows.find((r) => r.attributeId === o.attributeId)}
                errors={showErrors ? errors : {}}
                disabled={disabled}
                onChange={(next) => setOptions(value.options.map((x, j) => (j === i ? next : x)))}
                onRemove={() => setOptions(value.options.filter((_, j) => j !== i))}
              />
            ))}
            {err("options") ? (
              <p className="text-sm font-medium">{err("options")}</p>
            ) : null}
            {value.options.length < VARIANT_LIMITS.options && choices.length > 0 ? (
              <div className="flex max-w-90 flex-col gap-2">
                <Label htmlFor="v-add-option">
                  {hasOptions ? "Add a second option" : "Add an option"}
                </Label>
                <Select
                  value=""
                  disabled={disabled}
                  onValueChange={(k) =>
                    setOptions([...value.options, { id: newId(), position: value.options.length + 1, attributeId: k, values: [] }])
                  }
                >
                  <SelectTrigger id="v-add-option">
                    <SelectValue placeholder="What do shoppers choose?" />
                  </SelectTrigger>
                  <SelectContent>
                    {choices.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        <span>
                          {c.label}
                          <span className="ml-2 text-muted-foreground">{c.hint}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </EditorSection>

          <EditorSection
            title="Variants and prices"
            description={
              ready
                ? `${value.variants.length} of up to ${VARIANT_LIMITS.variants}. ${priceHelp}.`
                : undefined
            }
            aside={
              ready && many ? (
                <span className="flex gap-3">
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm font-medium"
                    disabled={disabled}
                    onClick={() =>
                      onChange({ ...value, variants: applyToAll(value, "shopPriceAmount") })
                    }
                  >
                    Use the first price for all
                  </Button>
                </span>
              ) : undefined
            }
          >
            {ready ? (
              <div className="grid gap-2">
                <FieldError text={err("variants")} />
                <TableFrame>
                  <TableHeader>
                    <TableRow>
                      <Th>Variant</Th>
                      <Th width="160px">{priceLabel} *</Th>
                      <Th width="160px">Was price</Th>
                      <Th width="96px">
                        <span className="sr-only">Details and remove</span>
                      </Th>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {value.variants.map((r, i) => {
                      const cell = (field: string) => err(`variants[${i}].${field}`);
                      const unit = previewUnitPrice(value, r);
                      const detailError = ["gtin", "sku", "weightGrams", "packQuantity", "packUnit", "mediaStorageKey"].some(
                        (f) => !!cell(f),
                      );
                      const open = openRows.has(r.id) || detailError;
                      const name = label(r);
                      return (
                        <Fragment key={r.id}>
                          <TableRow className="align-top">
                            <Td className="pt-[22px] align-top">
                              <span className="block font-medium">{name}</span>
                              <span className="block font-mono text-xs text-muted-foreground">
                                {r.code ?? "New"}
                              </span>
                              {cell("optionValueIds") ? <CellError text={cell("optionValueIds")!} /> : null}
                            </Td>
                            <Td className="align-top">
                              <MoneyInput
                                label={`Price for ${name}`}
                                value={r.shopPriceAmount}
                                disabled={disabled}
                                invalid={!!cell("shopPriceAmount")}
                                onBlur={leave(`variants[${i}].shopPriceAmount`)}
                                onChange={(v) => patchRow(i, { shopPriceAmount: v })}
                              />
                              {cell("shopPriceAmount") ? <CellError text={cell("shopPriceAmount")!} /> : null}
                              {unit ? (
                                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                                  {unitPriceText(unit)}
                                </p>
                              ) : null}
                            </Td>
                            <Td className="align-top">
                              <MoneyInput
                                label={`Was price for ${name}`}
                                value={r.shopCompareAtAmount}
                                disabled={disabled}
                                invalid={!!cell("shopCompareAtAmount")}
                                onBlur={leave(`variants[${i}].shopCompareAtAmount`)}
                                onChange={(v) => patchRow(i, { shopCompareAtAmount: v })}
                              />
                              {cell("shopCompareAtAmount") ? (
                                <CellError text={cell("shopCompareAtAmount")!} />
                              ) : null}
                            </Td>
                            <Td className="align-top">
                              <div className="flex justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-expanded={open}
                                  aria-label={`${open ? "Hide" : "Show"} codes and shipping for ${name}`}
                                  onClick={() => toggleRow(r.id)}
                                >
                                  <ChevronDown className={open ? "rotate-180 transition-transform" : "transition-transform"} />
                                </Button>
                                {value.variants.length > 1 ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Don't sell ${name}`}
                                    disabled={disabled}
                                    onClick={() => removeRow(i)}
                                  >
                                    <X />
                                  </Button>
                                ) : null}
                              </div>
                            </Td>
                          </TableRow>
                          {open ? (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={4} className="bg-muted/30 px-4 py-4 whitespace-normal">
                                <div className="grid gap-4 sm:grid-cols-3">
                                  <FormField id={`v-gtin-${r.id}`} label="Barcode" optional error={cell("gtin")}>
                                    <Input
                                      id={`v-gtin-${r.id}`}
                                      className="font-mono"
                                      inputMode="numeric"
                                      placeholder="Scan or type"
                                      value={r.gtin}
                                      disabled={disabled}
                                      aria-invalid={!!cell("gtin")}
                                      onBlur={leave(`variants[${i}].gtin`)}
                                      onChange={(e) => patchRow(i, { gtin: e.target.value })}
                                    />
                                  </FormField>
                                  <FormField id={`v-sku-${r.id}`} label="Your code (SKU)" optional error={cell("sku")}>
                                    <Input
                                      id={`v-sku-${r.id}`}
                                      className="font-mono"
                                      value={r.sku}
                                      disabled={disabled}
                                      aria-invalid={!!cell("sku")}
                                      onBlur={leave(`variants[${i}].sku`)}
                                      onChange={(e) => patchRow(i, { sku: e.target.value })}
                                    />
                                  </FormField>
                                  <FormField
                                    id={`v-weight-${r.id}`}
                                    label="Packed weight (g)"
                                    optional
                                    error={cell("weightGrams")}
                                  >
                                    <Input
                                      id={`v-weight-${r.id}`}
                                      inputMode="numeric"
                                      placeholder="Estimated"
                                      value={r.weightGrams}
                                      disabled={disabled}
                                      aria-invalid={!!cell("weightGrams")}
                                      onBlur={leave(`variants[${i}].weightGrams`)}
                                      onChange={(e) => patchRow(i, { weightGrams: e.target.value })}
                                    />
                                  </FormField>
                                  <FormField
                                    id={`v-pack-${r.id}`}
                                    label="Net quantity"
                                    optional
                                    error={cell("packQuantity") ?? cell("packUnit")}
                                  >
                                    <div className="flex gap-2">
                                      <Input
                                        id={`v-pack-${r.id}`}
                                        inputMode="decimal"
                                        placeholder="500"
                                        className="min-w-0 flex-1"
                                        value={r.packQuantity}
                                        disabled={disabled}
                                        aria-invalid={!!cell("packQuantity")}
                                        onBlur={leave(`variants[${i}].packQuantity`)}
                                        onChange={(e) => patchRow(i, { packQuantity: e.target.value })}
                                      />
                                      <Select
                                        value={r.packUnit === "" ? NONE : r.packUnit}
                                        onValueChange={(v) =>
                                          patchRow(i, {
                                            packUnit: v === NONE ? "" : (v as VariantRowDraft["packUnit"]),
                                          })
                                        }
                                        disabled={disabled}
                                      >
                                        <SelectTrigger aria-label={`Unit for ${name}`} className="w-24">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value={NONE}>Unit</SelectItem>
                                          {unitsFor(value.unitBasis).map((u) => (
                                            <SelectItem key={u} value={u}>
                                              {PACK_UNIT_LABELS[u]}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </FormField>
                                  {media && media.length > 0 ? (
                                    <FormField id={`v-media-${r.id}`} label="Picture" optional error={cell("mediaStorageKey")}>
                                      <Select
                                        value={r.mediaStorageKey ?? NONE}
                                        onValueChange={(v) => patchRow(i, { mediaStorageKey: v === NONE ? null : v })}
                                        disabled={disabled}
                                      >
                                        <SelectTrigger id={`v-media-${r.id}`} className="w-full">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value={NONE}>Product pictures</SelectItem>
                                          {media.map((m, k) => (
                                            <SelectItem key={m.storageKey} value={m.storageKey}>
                                              {m.altText || `Picture ${k + 1}`}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </FormField>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </TableFrame>
                {missing ? (
                  <div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      onClick={() => onChange({ ...value, variants: addMissingRows(value) })}
                    >
                      <Plus /> Add the missing combinations
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                {hasOptions
                  ? "Add at least one value to each option, and every variant appears here to price."
                  : "Add an option above, and every variant appears here to price."}
              </p>
            )}
            {ready
              ? unitPriceField(
                  missingQuantity > 0
                    ? `Worked out from each variant's net quantity. ${missingQuantity === 1 ? "1 variant has" : `${missingQuantity} variants have`} none yet, so shows no unit price.`
                    : "Worked out from each variant's net quantity, so shoppers can compare.",
                )
              : null}
          </EditorSection>
        </>
      ) : one ? (
        <>
          <EditorSection title="Pricing" description={`${priceHelp}.`}>
            {one.code ? (
              <p className="text-sm text-muted-foreground">
                Effy code <span className="font-mono text-foreground">{one.code}</span>
              </p>
            ) : null}
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                id="v-price"
                label={priceLabel}
                required
                error={oneCell("shopPriceAmount")}
              >
                <MoneyInput
                  id="v-price"
                  value={one.shopPriceAmount}
                  disabled={disabled}
                  invalid={!!oneCell("shopPriceAmount")}
                  onBlur={leave("variants[0].shopPriceAmount")}
                  onChange={(v) => patchRow(0, { shopPriceAmount: v })}
                />
              </FormField>
              <FormField
                id="v-was"
                label="Was price"
                optional
                help="Only while it is on sale: the earlier, higher price, shown crossed out."
                error={oneCell("shopCompareAtAmount")}
              >
                <MoneyInput
                  id="v-was"
                  value={one.shopCompareAtAmount}
                  disabled={disabled}
                  invalid={!!oneCell("shopCompareAtAmount")}
                  onBlur={leave("variants[0].shopCompareAtAmount")}
                  onChange={(v) => patchRow(0, { shopCompareAtAmount: v })}
                />
              </FormField>
            </div>
          </EditorSection>

          <EditorSection
            title="Pack size and unit price"
            description="How much is in one pack, and the price per kilo, litre or 100 g that shoppers compare."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                id="v-pack"
                label="Net quantity"
                optional
                help="As printed on the pack, e.g. 500 g, 1 L or 6 each."
                error={oneCell("packQuantity") ?? oneCell("packUnit")}
              >
                <div className="flex gap-2">
                  <Input
                    id="v-pack"
                    inputMode="decimal"
                    placeholder="500"
                    className="min-w-0 flex-1"
                    value={one.packQuantity}
                    disabled={disabled}
                    aria-invalid={!!oneCell("packQuantity")}
                    onBlur={leave("variants[0].packQuantity")}
                    onChange={(e) => patchRow(0, { packQuantity: e.target.value })}
                  />
                  <Select
                    value={one.packUnit === "" ? NONE : one.packUnit}
                    onValueChange={(v) =>
                      patchRow(0, {
                        packUnit: v === NONE ? "" : (v as VariantRowDraft["packUnit"]),
                      })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger aria-label="Unit" className="w-28" aria-invalid={!!oneCell("packUnit")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Unit</SelectItem>
                      {unitsFor(value.unitBasis).map((u) => (
                        <SelectItem key={u} value={u}>
                          {PACK_UNIT_LABELS[u]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </FormField>
              <FormField
                id="v-basis"
                label="Unit price"
                optional
                help={
                  oneUnit
                    ? `Shoppers see ${unitPriceText(oneUnit)} beside the price.`
                    : value.unitBasis === ""
                      ? "Shown beside the price so shoppers can compare."
                      : "Add the net quantity to work it out."
                }
                error={err("unitBasis")}
              >
                <Select
                  value={value.unitBasis === "" ? NONE : value.unitBasis}
                  onValueChange={(v) =>
                    onChange({ ...value, unitBasis: v === NONE ? "" : (v as UnitBasis) })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger id="v-basis" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Don&apos;t show one</SelectItem>
                    {UNIT_BASES.map((b) => (
                      <SelectItem key={b} value={b}>
                        {UNIT_BASIS_LABELS[b]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
          </EditorSection>

          <EditorSection>
            <Collapsible
              defaultOpen={
                !!(one.sku || one.gtin || one.weightGrams || oneCell("sku") || oneCell("gtin") || oneCell("weightGrams"))
              }
            >
              <CollapsibleTrigger asChild>
                <Button type="button" variant="link" className="group/more h-auto px-0">
                  <ChevronRight
                    aria-hidden="true"
                    className="transition-transform group-data-[state=open]/more:rotate-90"
                  />
                  Codes and shipping
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-5 pt-5">
                <div className="grid gap-5 sm:grid-cols-3">
                  <FormField
                    id="v-gtin"
                    label="Barcode"
                    optional
                    help="The number under the barcode (EAN or UPC)."
                    error={oneCell("gtin")}
                  >
                    <Input
                      id="v-gtin"
                      className="font-mono"
                      inputMode="numeric"
                      placeholder="Scan or type"
                      value={one.gtin}
                      disabled={disabled}
                      aria-invalid={!!oneCell("gtin")}
                      onBlur={leave("variants[0].gtin")}
                      onChange={(e) => patchRow(0, { gtin: e.target.value })}
                    />
                  </FormField>
                  <FormField
                    id="v-sku"
                    label="Your code (SKU)"
                    optional
                    help="Your own stock code, for your records."
                    error={oneCell("sku")}
                  >
                    <Input
                      id="v-sku"
                      className="font-mono"
                      value={one.sku}
                      disabled={disabled}
                      aria-invalid={!!oneCell("sku")}
                      onBlur={leave("variants[0].sku")}
                      onChange={(e) => patchRow(0, { sku: e.target.value })}
                    />
                  </FormField>
                  <FormField
                    id="v-weight"
                    label="Packed weight (g)"
                    optional
                    help="With its packaging. Estimated if left empty."
                    error={oneCell("weightGrams")}
                  >
                    <Input
                      id="v-weight"
                      inputMode="numeric"
                      value={one.weightGrams}
                      disabled={disabled}
                      aria-invalid={!!oneCell("weightGrams")}
                      onBlur={leave("variants[0].weightGrams")}
                      onChange={(e) => patchRow(0, { weightGrams: e.target.value })}
                    />
                  </FormField>
                </div>
                {media && media.length > 0 ? (
                  <FormField id="v-media" label="Picture" optional>
                    <Select
                      value={one.mediaStorageKey ?? NONE}
                      onValueChange={(v) => patchRow(0, { mediaStorageKey: v === NONE ? null : v })}
                      disabled={disabled}
                    >
                      <SelectTrigger id="v-media" className="w-full max-w-90">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Product pictures</SelectItem>
                        {media.map((m, k) => (
                          <SelectItem key={m.storageKey} value={m.storageKey}>
                            {m.altText || `Picture ${k + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                ) : null}
                <FieldError text={err("variants")} />
              </CollapsibleContent>
            </Collapsible>
          </EditorSection>
        </>
      ) : null}
    </div>
  );
}


function CellError({ text }: { text: string }) {
  return <p className="mt-1 text-sm font-medium leading-tight">{text}</p>;
}

function OptionRow({
  option,
  index,
  row,
  errors,
  disabled,
  onChange,
  onRemove,
}: {
  option: OptionInputDTO;
  index: number;
  /** The library attribute: the category offers it as an option. */
  row: CategoryFormRow | undefined;
  errors: Record<string, string>;
  disabled?: boolean;
  onChange: (next: OptionInputDTO) => void;
  onRemove: () => void;
}) {
  const f = `options[${index}]`;
  const name = row?.name ?? "This option is no longer offered here";
  const full = option.values.length >= VARIANT_LIMITS.valuesPerOption;
  const valueError = Object.entries(errors).find(([k]) =>
    k.startsWith(`${f}.values`),
  )?.[1];
  const labelOf = (v: OptionInputDTO["values"][number]) =>
    row?.values.find((x) => x.id === v.allowedValueId)?.label ??
    "No longer offered";
  const removeValue = (id: string) =>
    onChange({
      ...option,
      values: option.values
        .filter((x) => x.id !== id)
        .map((x, i) => ({ ...x, position: i })),
    });

  const chosen = new Set(option.values.map((v) => v.allowedValueId));
  const remaining = row ? row.values.filter((v) => !chosen.has(v.id)) : [];

  return (
    <div className="border-border grid gap-3 rounded-[var(--radius)] border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">
          Option {index + 1}: {name}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onRemove}
        >
          Remove option
        </Button>
      </div>
      {errors[`${f}.attributeId`] ? (
        <p className="text-sm font-medium">{errors[`${f}.attributeId`]}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {option.values.map((v) => (
          <span
            key={v.id}
            className="border-border bg-muted inline-flex h-9 items-center gap-1 rounded-md border py-1 pr-1 pl-3 text-sm"
          >
            {labelOf(v)}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="touch-hit size-6 pointer-coarse:min-h-0 pointer-coarse:min-w-0"
              aria-label={`Remove ${labelOf(v)}`}
              disabled={disabled}
              onClick={() => removeValue(v.id)}
            >
              <X className="size-4" />
            </Button>
          </span>
        ))}
        {!full && remaining.length > 0 ? (
          <Select
            value=""
            disabled={disabled}
            onValueChange={(allowedValueId) =>
              onChange({
                ...option,
                values: [
                  ...option.values,
                  {
                    id: newId(),
                    allowedValueId,
                    position: option.values.length,
                  },
                ],
              })
            }
          >
            <SelectTrigger
              aria-label={`Add a ${name.toLowerCase()}`}
              className="w-48"
            >
              <SelectValue placeholder={`Add a ${name.toLowerCase()}…`} />
            </SelectTrigger>
            <SelectContent>
              {remaining.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        The list is Effy&apos;s, so every product says {name.toLowerCase()} the
        same way.
      </p>
      {errors[`${f}.values`] || valueError ? (
        <p className="text-sm font-medium">
          {errors[`${f}.values`] ?? valueError}
        </p>
      ) : null}
    </div>
  );
}
