import { useState } from "react";

import { ChevronRight, Plus, X } from "lucide-react";

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
  TableHeader,
  TableRow,
} from "@effy/design-system/ui";
import {
  PACK_SIZE_OPTION_NAME,
  PACK_UNIT_LABELS,
  PACK_UNITS,
  UNIT_BASES,
  UNIT_BASIS_LABELS,
  VARIANT_LIMITS,
  packLabel,
  unitPriceText,
  type CategoryFormRow,
  type OptionInputDTO,
  type PackUnit,
  type UnitBasis,
} from "@effy/shared-types";

import { EditorSection, FieldError, FormField, MoneyInput } from "./fields";
import { TableFrame, Td, Th } from "./table";

import {
  addMissingRows,
  applyToAll,
  labelledOptions,
  newId,
  optionAttributes,
  packIndex,
  previewUnitPrice,
  rowLabel,
  syncRows,
  unitsFor,
  type PackSizeDraft,
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
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const leave = (path: string) => () =>
    setLeft((s) => (s.has(path) ? s : new Set(s).add(path)));
  const err = (path: string) =>
    showErrors || left.has(path) ? errors[path] : undefined;

  function setOptions(
    next: OptionInputDTO[],
    packs: Record<string, PackSizeDraft> = value.packs,
  ) {
    const options = next.map((o, i) => ({ ...o, position: i + 1 }));
    onChange({
      ...value,
      options,
      packs,
      variants: syncRows(value.options, options, value.variants),
    });
  }
  const label = (r: VariantRowDraft) => rowLabel(value, r, rows);
  const packK = packIndex(value);
  const offered = optionAttributes(rows);
  const used = new Set(
    value.options.map((o) => (o.kind === "pack_size" ? "pack" : o.attributeId)),
  );
  const choices = [
    ...(used.has("pack")
      ? []
      : [{ key: "pack", label: PACK_SIZE_OPTION_NAME }]),
    ...offered
      .filter((r) => !used.has(r.attributeId))
      .map((r) => ({ key: r.attributeId, label: r.name })),
  ];
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
  const one = value.variants[0];
  const oneCell = (field: string) => err(`variants[0].${field}`);
  const oneUnit = one ? previewUnitPrice(value, one) : null;

  const unitPricing = (
        <div className="grid max-w-90 gap-2">
          <Label htmlFor="v-basis">Unit pricing</Label>
          <Select
            value={value.unitBasis === "" ? NONE : value.unitBasis}
            onValueChange={(v) =>
              onChange({
                ...value,
                unitBasis: v === NONE ? "" : (v as UnitBasis),
              })
            }
            disabled={disabled}
          >
            <SelectTrigger id="v-basis" className="w-full" aria-describedby="v-basis-help">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No unit price</SelectItem>
              {UNIT_BASES.map((b) => (
                <SelectItem key={b} value={b}>
                  {UNIT_BASIS_LABELS[b]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id="v-basis-help" className="text-sm text-muted-foreground">
            How shoppers compare sizes — "$0.64 / 100 g" beside the price. Give
            each size its pack size below.
          </p>
          {err("unitBasis") ? (
            <p className="text-sm font-medium">{err("unitBasis")}</p>
          ) : null}
        </div>
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
              ["one", "One size", "One price. Most products are sold this way."],
              ["several", "Several sizes or options", "e.g. 500 g and 1 kg, or a choice of flavours."],
            ] as const
          ).map(([v, title, text]) => (
            <Label
              key={v}
              htmlFor={`v-sold-${v}`}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal transition-colors hover:bg-accent/50 has-data-[state=checked]:border-primary-fill has-data-[state=checked]:bg-primary-muted"
            >
              <RadioGroupItem id={`v-sold-${v}`} value={v} className="mt-0.5" />
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
                row={
                  o.attributeId
                    ? rows.find((r) => r.attributeId === o.attributeId)
                    : undefined
                }
                packs={value.packs}
                unitBasis={value.unitBasis}
                errors={showErrors ? errors : {}}
                disabled={disabled}
                onChange={(next, packs) =>
                  setOptions(
                    value.options.map((x, j) => (j === i ? next : x)),
                    packs,
                  )
                }
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
                    setOptions([
                      ...value.options,
                      k === "pack"
                        ? {
                            id: newId(),
                            position: value.options.length + 1,
                            kind: "pack_size",
                            attributeId: null,
                            values: [],
                          }
                        : {
                            id: newId(),
                            position: value.options.length + 1,
                            kind: "attribute",
                            attributeId: k,
                            values: [],
                          },
                    ])
                  }
                >
                  <SelectTrigger id="v-add-option">
                    <SelectValue placeholder="What do shoppers choose?" />
                  </SelectTrigger>
                  <SelectContent>
                    {choices.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </EditorSection>

          <EditorSection
            title="Sizes and prices"
            description={
              hasOptions
                ? `${value.variants.length} of up to ${VARIANT_LIMITS.variants}. ${priceHelp}.`
                : undefined
            }
          >
            {hasOptions ? (
              <div className="grid gap-2">
                {err("variants") ? (
                  <p className="text-sm font-medium">{err("variants")}</p>
                ) : null}
                <TableFrame>
                  <TableHeader>
                    <TableRow>
                      {hasOptions ? (
                        <Th>
                          Variant
                          <ColumnHelp>Effy code once saved</ColumnHelp>
                        </Th>
                      ) : null}
                      <Th width="120px">
                        {priceLabel} *<ColumnHelp>{priceHelp}</ColumnHelp>
                        {many ? (
                          <ApplyAll
                            label="price"
                            disabled={disabled}
                            onClick={() =>
                              onChange({
                                ...value,
                                variants: applyToAll(value, "shopPriceAmount"),
                              })
                            }
                          />
                        ) : null}
                      </Th>
                      <Th width="110px">
                        Was
                        <ColumnHelp>Earlier price, for a sale</ColumnHelp>
                      </Th>
                      <Th width="130px">
                        Your code
                        <ColumnHelp>Your own stock code (optional)</ColumnHelp>
                      </Th>
                      <Th width="150px">
                        Barcode
                        <ColumnHelp>Number on the pack (optional)</ColumnHelp>
                      </Th>
                      <Th width="120px">
                        Weight (g)
                        <ColumnHelp>Packed, for delivery</ColumnHelp>
                        {many ? (
                          <ApplyAll
                            label="weight"
                            disabled={disabled}
                            onClick={() =>
                              onChange({
                                ...value,
                                variants: applyToAll(value, "weightGrams"),
                              })
                            }
                          />
                        ) : null}
                      </Th>
                      <Th width="170px">
                        Pack size
                        <ColumnHelp>e.g. 500 g — for unit price</ColumnHelp>
                      </Th>
                      {media && media.length > 0 ? (
                        <Th width="140px">Picture</Th>
                      ) : null}
                      {hasOptions ? <Th width="44px" /> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {value.variants.map((r, i) => {
                      const unit = previewUnitPrice(value, r);
                      const cell = (field: string) => err(`variants[${i}].${field}`);
                      return (
                        <TableRow key={r.id} className="align-top">
                          {hasOptions ? (
                            <Td>
                              <span className="font-medium">{label(r)}</span>
                              <span className="text-muted-foreground block font-mono text-sm">
                                {r.code ?? "New"}
                              </span>
                              {cell("optionValueIds") ? (
                                <CellError text={cell("optionValueIds")!} />
                              ) : null}
                            </Td>
                          ) : null}
                          <Td>
                            <Input
                              aria-label={`Price for ${label(r)}`}
                              inputMode="decimal"
                              placeholder="0.00"
                              value={r.shopPriceAmount}
                              disabled={disabled}
                              aria-invalid={!!cell("shopPriceAmount")}
                              onBlur={leave(`variants[${i}].shopPriceAmount`)}
                              onChange={(e) =>
                                patchRow(i, { shopPriceAmount: e.target.value })
                              }
                            />
                            {cell("shopPriceAmount") ? (
                              <CellError text={cell("shopPriceAmount")!} />
                            ) : null}
                            {unit ? (
                              <p className="text-muted-foreground mt-1 text-sm tabular-nums">
                                {unitPriceText(unit)}
                              </p>
                            ) : null}
                          </Td>
                          <Td>
                            <Input
                              aria-label={`Was-price for ${label(r)}`}
                              inputMode="decimal"
                              value={r.shopCompareAtAmount}
                              disabled={disabled}
                              aria-invalid={!!cell("shopCompareAtAmount")}
                              onBlur={leave(`variants[${i}].shopCompareAtAmount`)}
                              onChange={(e) =>
                                patchRow(i, { shopCompareAtAmount: e.target.value })
                              }
                            />
                            {cell("shopCompareAtAmount") ? (
                              <CellError text={cell("shopCompareAtAmount")!} />
                            ) : null}
                          </Td>
                          <Td>
                            <Input
                              aria-label={`Your code for ${label(r)}`}
                              className="font-mono"
                              value={r.sku}
                              disabled={disabled}
                              aria-invalid={!!cell("sku")}
                              onBlur={leave(`variants[${i}].sku`)}
                              onChange={(e) => patchRow(i, { sku: e.target.value })}
                            />
                            {cell("sku") ? <CellError text={cell("sku")!} /> : null}
                          </Td>
                          <Td>
                            <Input
                              aria-label={`Barcode for ${label(r)}`}
                              className="font-mono"
                              inputMode="numeric"
                              value={r.gtin}
                              disabled={disabled}
                              aria-invalid={!!cell("gtin")}
                              onBlur={leave(`variants[${i}].gtin`)}
                              onChange={(e) => patchRow(i, { gtin: e.target.value })}
                            />
                            {cell("gtin") ? <CellError text={cell("gtin")!} /> : null}
                          </Td>
                          <Td>
                            <Input
                              aria-label={`Shipping weight in grams for ${label(r)}`}
                              inputMode="numeric"
                              placeholder="assumed"
                              value={r.weightGrams}
                              disabled={disabled}
                              aria-invalid={!!cell("weightGrams")}
                              onBlur={leave(`variants[${i}].weightGrams`)}
                              onChange={(e) =>
                                patchRow(i, { weightGrams: e.target.value })
                              }
                            />
                            {cell("weightGrams") ? (
                              <CellError text={cell("weightGrams")!} />
                            ) : null}
                          </Td>
                          <Td>
                            {packK >= 0 ? (
                              <span className="text-sm">
                                {labelledOptions(value, rows)[packK]?.values.find(
                                  (v) => v.id === r.optionValueIds[packK],
                                )?.value ?? "—"}
                              </span>
                            ) : (
                              <div className="flex gap-2">
                                <Input
                                  aria-label={`Pack quantity for ${label(r)}`}
                                  inputMode="decimal"
                                  className="w-18"
                                  value={r.packQuantity}
                                  disabled={disabled}
                                  aria-invalid={!!cell("packQuantity")}
                                  onBlur={leave(`variants[${i}].packQuantity`)}
                                  onChange={(e) =>
                                    patchRow(i, { packQuantity: e.target.value })
                                  }
                                />
                                <Select
                                  value={r.packUnit === "" ? NONE : r.packUnit}
                                  onValueChange={(v) =>
                                    patchRow(i, {
                                      packUnit:
                                        v === NONE
                                          ? ""
                                          : (v as VariantRowDraft["packUnit"]),
                                    })
                                  }
                                  disabled={disabled}
                                >
                                  <SelectTrigger
                                    aria-label={`Pack unit for ${label(r)}`}
                                    className="w-22"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={NONE}>—</SelectItem>
                                    {unitsFor(value.unitBasis).map((u) => (
                                      <SelectItem key={u} value={u}>
                                        {PACK_UNIT_LABELS[u]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            {cell("packQuantity") || cell("packUnit") ? (
                              <CellError
                                text={(cell("packQuantity") ?? cell("packUnit"))!}
                              />
                            ) : null}
                          </Td>
                          {media && media.length > 0 ? (
                            <Td>
                              <Select
                                value={r.mediaStorageKey ?? NONE}
                                onValueChange={(v) =>
                                  patchRow(i, {
                                    mediaStorageKey: v === NONE ? null : v,
                                  })
                                }
                                disabled={disabled}
                              >
                                <SelectTrigger aria-label={`Picture for ${label(r)}`}>
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
                              {cell("mediaStorageKey") ? (
                                <CellError text={cell("mediaStorageKey")!} />
                              ) : null}
                            </Td>
                          ) : null}
                          {hasOptions ? (
                            <Td>
                              {value.variants.length > 1 ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Don't sell ${label(r)}`}
                                  disabled={disabled}
                                  onClick={() => removeRow(i)}
                                >
                                  <X />
                                </Button>
                              ) : null}
                            </Td>
                          ) : null}
                        </TableRow>
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
                      onClick={() =>
                        onChange({ ...value, variants: addMissingRows(value) })
                      }
                    >
                      <Plus /> Add the missing combinations
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                Add an option above and each size appears here to price.
              </p>
            )}
            {unitPricing}
          </EditorSection>
        </>
      ) : one ? (
        <EditorSection title="Price" description={`${priceHelp}.`}>
          {one.code ? (
            <p className="text-sm text-muted-foreground">
              Effy code <span className="font-mono text-foreground">{one.code}</span>
            </p>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="v-price" label={priceLabel} required error={oneCell("shopPriceAmount")}>
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
              help="Only for a sale. Shoppers see it crossed out."
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
          <FormField
            id="v-pack"
            label="Size on the pack"
            optional
            help={oneUnit ? `Shoppers see ${unitPriceText(oneUnit)}.` : "e.g. 500 g. Needed for a unit price."}
            error={oneCell("packQuantity") ?? oneCell("packUnit")}
          >
            <div className="flex gap-2">
              <Input
                id="v-pack"
                inputMode="decimal"
                placeholder="500"
                className="w-32"
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
                <SelectTrigger aria-label="Pack unit" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>unit</SelectItem>
                  {unitsFor(value.unitBasis).map((u) => (
                    <SelectItem key={u} value={u}>
                      {PACK_UNIT_LABELS[u]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FormField>
          {unitPricing}
          {media && media.length > 0 ? (
            <FormField id="v-media" label="Picture for this size" optional>
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
                Codes and shipping weight
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <div className="grid gap-5 sm:grid-cols-3">
                <FormField id="v-sku" label="Your code" optional error={oneCell("sku")}>
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
                <FormField id="v-gtin" label="Barcode" optional error={oneCell("gtin")}>
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
                  id="v-weight"
                  label="Packed weight (g)"
                  optional
                  help="For delivery; assumed if empty."
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
            </CollapsibleContent>
          </Collapsible>
          <FieldError text={err("variants")} />
        </EditorSection>
      ) : null}
    </div>
  );
}


function ColumnHelp({ children }: { children: string }) {
  return (
    <span className="text-muted-foreground block text-xs font-normal tracking-normal normal-case">
      {children}
    </span>
  );
}

function ApplyAll({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="link"
      className="mt-1 text-xs"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Use the first row's ${label} for every variant`}
    >
      Apply first to all
    </Button>
  );
}

function CellError({ text }: { text: string }) {
  return <p className="mt-1 text-sm font-medium leading-tight">{text}</p>;
}

function OptionRow({
  option,
  index,
  row,
  packs,
  unitBasis,
  errors,
  disabled,
  onChange,
  onRemove,
}: {
  option: OptionInputDTO;
  index: number;
  /** The library attribute for an attribute option. */
  row: CategoryFormRow | undefined;
  packs: Record<string, PackSizeDraft>;
  unitBasis: "" | UnitBasis;
  errors: Record<string, string>;
  disabled?: boolean;
  onChange: (
    next: OptionInputDTO,
    packs?: Record<string, PackSizeDraft>,
  ) => void;
  onRemove: () => void;
}) {
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState<"" | PackUnit>("");
  const f = `options[${index}]`;
  const isPack = option.kind === "pack_size";
  const name = isPack
    ? PACK_SIZE_OPTION_NAME
    : (row?.name ?? "This option is no longer offered here");
  const full = option.values.length >= VARIANT_LIMITS.valuesPerOption;
  const valueError = Object.entries(errors).find(([k]) =>
    k.startsWith(`${f}.values`),
  )?.[1];
  const labelOf = (v: OptionInputDTO["values"][number]) => {
    if (isPack) {
      const p = packs[v.id];
      return (
        (p && p.unit !== "" && packLabel(p.quantity, p.unit)) || "Size not set"
      );
    }
    return (
      row?.values.find((x) => x.id === v.allowedValueId)?.label ??
      "No longer offered"
    );
  };
  const removeValue = (id: string) => {
    const nextPacks = { ...packs };
    delete nextPacks[id];
    onChange(
      {
        ...option,
        values: option.values
          .filter((x) => x.id !== id)
          .map((x, i) => ({ ...x, position: i })),
      },
      isPack ? nextPacks : undefined,
    );
  };

  function addPack() {
    const label = unit !== "" ? packLabel(qty.trim(), unit) : null;
    if (!label) return;
    if (option.values.some((v) => labelOf(v) === label)) return;
    const id = newId();
    onChange(
      {
        ...option,
        values: [
          ...option.values,
          { id, allowedValueId: null, position: option.values.length },
        ],
      },
      {
        ...packs,
        [id]: { quantity: qty.trim(), unit },
      },
    );
    setQty("");
  }

  const chosen = new Set(option.values.map((v) => v.allowedValueId));
  const remaining = row ? row.values.filter((v) => !chosen.has(v.id)) : [];
  const packUnits = unitBasis === "" ? PACK_UNITS : unitsFor(unitBasis);

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
        {!full && isPack ? (
          <div className="flex items-center gap-2">
            <Input
              aria-label="Pack size quantity"
              inputMode="decimal"
              placeholder="500"
              className="w-24"
              value={qty}
              disabled={disabled}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPack();
                }
              }}
            />
            <Select
              value={unit === "" ? NONE : unit}
              onValueChange={(v) => setUnit(v === NONE ? "" : (v as PackUnit))}
              disabled={disabled}
            >
              <SelectTrigger aria-label="Pack size unit" className="w-24">
                <SelectValue placeholder="unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>unit</SelectItem>
                {packUnits.map((u) => (
                  <SelectItem key={u} value={u}>
                    {PACK_UNIT_LABELS[u]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                disabled ||
                unit === "" ||
                !packLabel(qty.trim(), unit as PackUnit)
              }
              onClick={addPack}
            >
              Add size
            </Button>
          </div>
        ) : null}
        {!full && !isPack && remaining.length > 0 ? (
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
      {!isPack ? (
        <p className="text-xs text-muted-foreground">
          The list is Effy's, so every product says {name.toLowerCase()} the
          same way.
        </p>
      ) : null}
      {errors[`${f}.values`] || valueError ? (
        <p className="text-sm font-medium">
          {errors[`${f}.values`] ?? valueError}
        </p>
      ) : null}
    </div>
  );
}
