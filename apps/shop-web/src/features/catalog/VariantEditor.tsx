import { useState } from "react";

import { Plus, X } from "lucide-react";

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui";
import { PACK_UNIT_LABELS, UNIT_BASES, UNIT_BASIS_LABELS, VARIANT_LIMITS, unitPriceText, type OptionInputDTO, type UnitBasis } from "@effy/shared-types";

import { MicroLabel, TableFrame, Td, Th } from "@/components/console/primitives";

import {
  addMissingRows,
  applyToAll,
  newId,
  previewUnitPrice,
  rowLabel,
  syncRows,
  unitsFor,
  type VariantRowDraft,
  type VariantSetDraft,
} from "./variants";

/**
 * Sizes and prices (098) — the options a product varies by, and one row per variant it is sold as.
 *
 * ⚠ A TABLE, NOT CARDS (constitution Principle V). Fifty variants are fifty rows an operator scans
 * down a column at a time — every price, then every stock code — which a stack of cards makes
 * impossible.
 *
 * A product with no options is edited as ONE row with no option columns: "a loaf of bread" is the
 * common case and must not look like a spreadsheet.
 */
export interface VariantEditorProps {
  value: VariantSetDraft;
  onChange: (next: VariantSetDraft) => void;
  /** Field-path errors from `variantSetErrors` (or the server's problem body); shown when `showErrors`. */
  errors: Record<string, string>;
  showErrors: boolean;
  /** The product's gallery, for a variant's own picture. Absent while creating (nothing is uploaded yet). */
  media?: { storageKey: string; url: string; altText: string | null }[];
  disabled?: boolean;
}

const NONE = "__none__";

export function VariantEditor({ value, onChange, errors, showErrors, media, disabled }: VariantEditorProps) {
  // A cell's refusal shows once the operator has LEFT that cell, or once they try to continue
  // (`showErrors`) — never on rows they have not reached yet.
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const leave = (path: string) => () => setLeft((s) => (s.has(path) ? s : new Set(s).add(path)));
  const err = (path: string) => (showErrors || left.has(path) ? errors[path] : undefined);

  function setOptions(next: OptionInputDTO[]) {
    const options = next.map((o, i) => ({ ...o, position: i + 1 }));
    onChange({ ...value, options, variants: syncRows(value.options, options, value.variants) });
  }
  function patchRow(i: number, patch: Partial<VariantRowDraft>) {
    onChange({ ...value, variants: value.variants.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  }
  function removeRow(i: number) {
    onChange({ ...value, variants: value.variants.filter((_, j) => j !== i).map((r, j) => ({ ...r, position: j })) });
  }

  const hasOptions = value.options.length > 0;
  const many = value.variants.length > 1;
  const missing = hasOptions && addMissingRows(value).length > value.variants.length;

  return (
    <div className="grid gap-6">
      {/* ── Options ───────────────────────────────────────────────────────────────────────────── */}
      <div className="grid gap-3">
        <div className="grid gap-1">
          <MicroLabel>Options</MicroLabel>
          <p className="text-muted-foreground text-[13px]">
            {hasOptions
              ? "What shoppers choose between. Each combination you keep below is sold as its own item, with its own price and stock."
              : "Leave this empty if the product comes in one form. Add an option — Size, Flavour — if shoppers choose between versions of it."}
          </p>
        </div>

        {value.options.map((o, i) => (
          <OptionRow
            key={o.id}
            option={o}
            index={i}
            errors={showErrors ? errors : {}}
            disabled={disabled}
            onChange={(next) => setOptions(value.options.map((x, j) => (j === i ? next : x)))}
            onRemove={() => setOptions(value.options.filter((_, j) => j !== i))}
          />
        ))}
        {err("options") ? <p className="text-destructive text-xs">{err("options")}</p> : null}

        {value.options.length < VARIANT_LIMITS.options ? (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => setOptions([...value.options, { id: newId(), position: value.options.length + 1, name: "", values: [] }])}
            >
              <Plus /> {hasOptions ? "Add a second option" : "Add an option"}
            </Button>
          </div>
        ) : null}
      </div>

      {/* ── Unit pricing ─────────────────────────────────────────────────────────────────────── */}
      <div className="grid max-w-[360px] gap-2">
        <Label htmlFor="v-basis">Unit pricing</Label>
        <Select
          value={value.unitBasis === "" ? NONE : value.unitBasis}
          onValueChange={(v) => onChange({ ...value, unitBasis: v === NONE ? "" : (v as UnitBasis) })}
          disabled={disabled}
        >
          <SelectTrigger id="v-basis" aria-describedby="v-basis-help">
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
        <p id="v-basis-help" className="text-muted-foreground text-[13px]">
          How shoppers compare sizes — "$0.64 / 100 g" beside the price. Give each size its pack size below.
        </p>
        {err("unitBasis") ? <p className="text-destructive text-xs">{err("unitBasis")}</p> : null}
      </div>

      {/* ── Variants ─────────────────────────────────────────────────────────────────────────── */}
      <div className="grid gap-2">
        <MicroLabel>{hasOptions ? `Variants (${value.variants.length} of up to ${VARIANT_LIMITS.variants})` : "Price and codes"}</MicroLabel>
        {!hasOptions && value.variants[0]?.code ? (
          <p className="text-muted-foreground text-[13px]">
            Effy code <span className="text-foreground font-mono">{value.variants[0].code}</span>
          </p>
        ) : null}
        {err("variants") ? <p className="text-destructive text-xs">{err("variants")}</p> : null}
        <TableFrame>
          <thead className="bg-muted">
            <tr>
              {hasOptions ? (
                <Th>
                  Variant
                  <ColumnHelp>Effy code once saved</ColumnHelp>
                </Th>
              ) : null}
              <Th width="120px">
                Your price *
                <ColumnHelp>What Effy pays you</ColumnHelp>
                {many ? <ApplyAll label="price" disabled={disabled} onClick={() => onChange({ ...value, variants: applyToAll(value, "shopPriceAmount") })} /> : null}
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
                {many ? <ApplyAll label="weight" disabled={disabled} onClick={() => onChange({ ...value, variants: applyToAll(value, "weightGrams") })} /> : null}
              </Th>
              <Th width="170px">
                Pack size
                <ColumnHelp>e.g. 500 g — for unit price</ColumnHelp>
              </Th>
              {media && media.length > 0 ? <Th width="140px">Picture</Th> : null}
              {hasOptions ? <Th width="44px" /> : null}
            </tr>
          </thead>
          <tbody>
            {value.variants.map((r, i) => {
              const unit = previewUnitPrice(value, r);
              const cell = (field: string) => err(`variants[${i}].${field}`);
              return (
                <tr key={r.id} className="border-border border-t align-top">
                  {hasOptions ? (
                    <Td>
                      <span className="font-medium">{rowLabel(value, r)}</span>
                      <span className="text-muted-foreground block font-mono text-[11.5px]">{r.code ?? "New"}</span>
                      {cell("optionValueIds") ? <CellError text={cell("optionValueIds")!} /> : null}
                    </Td>
                  ) : null}
                  <Td>
                    <Input
                      aria-label={`Price for ${rowLabel(value, r)}`}
                      inputMode="decimal"
                      placeholder="0.00"
                      value={r.shopPriceAmount}
                      disabled={disabled}
                      aria-invalid={!!cell("shopPriceAmount")}
                      onBlur={leave(`variants[${i}].shopPriceAmount`)}
                      onChange={(e) => patchRow(i, { shopPriceAmount: e.target.value })}
                    />
                    {cell("shopPriceAmount") ? <CellError text={cell("shopPriceAmount")!} /> : null}
                    {unit ? <p className="text-muted-foreground mt-1 text-[11.5px] tabular-nums">{unitPriceText(unit)}</p> : null}
                  </Td>
                  <Td>
                    <Input
                      aria-label={`Was-price for ${rowLabel(value, r)}`}
                      inputMode="decimal"
                      value={r.shopCompareAtAmount}
                      disabled={disabled}
                      aria-invalid={!!cell("shopCompareAtAmount")}
                      onBlur={leave(`variants[${i}].shopCompareAtAmount`)}
                      onChange={(e) => patchRow(i, { shopCompareAtAmount: e.target.value })}
                    />
                    {cell("shopCompareAtAmount") ? <CellError text={cell("shopCompareAtAmount")!} /> : null}
                  </Td>
                  <Td>
                    <Input
                      aria-label={`Your code for ${rowLabel(value, r)}`}
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
                      aria-label={`Barcode for ${rowLabel(value, r)}`}
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
                      aria-label={`Shipping weight in grams for ${rowLabel(value, r)}`}
                      inputMode="numeric"
                      placeholder="assumed"
                      value={r.weightGrams}
                      disabled={disabled}
                      aria-invalid={!!cell("weightGrams")}
                      onBlur={leave(`variants[${i}].weightGrams`)}
                      onChange={(e) => patchRow(i, { weightGrams: e.target.value })}
                    />
                    {cell("weightGrams") ? <CellError text={cell("weightGrams")!} /> : null}
                  </Td>
                  <Td>
                    <div className="flex gap-1.5">
                      <Input
                        aria-label={`Pack quantity for ${rowLabel(value, r)}`}
                        inputMode="decimal"
                        className="w-[72px]"
                        value={r.packQuantity}
                        disabled={disabled}
                        aria-invalid={!!cell("packQuantity")}
                        onBlur={leave(`variants[${i}].packQuantity`)}
                        onChange={(e) => patchRow(i, { packQuantity: e.target.value })}
                      />
                      <Select
                        value={r.packUnit === "" ? NONE : r.packUnit}
                        onValueChange={(v) => patchRow(i, { packUnit: v === NONE ? "" : (v as VariantRowDraft["packUnit"]) })}
                        disabled={disabled}
                      >
                        <SelectTrigger aria-label={`Pack unit for ${rowLabel(value, r)}`} className="w-[86px]">
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
                    {cell("packQuantity") || cell("packUnit") ? <CellError text={(cell("packQuantity") ?? cell("packUnit"))!} /> : null}
                  </Td>
                  {media && media.length > 0 ? (
                    <Td>
                      <Select
                        value={r.mediaStorageKey ?? NONE}
                        onValueChange={(v) => patchRow(i, { mediaStorageKey: v === NONE ? null : v })}
                        disabled={disabled}
                      >
                        <SelectTrigger aria-label={`Picture for ${rowLabel(value, r)}`}>
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
                      {cell("mediaStorageKey") ? <CellError text={cell("mediaStorageKey")!} /> : null}
                    </Td>
                  ) : null}
                  {hasOptions ? (
                    <Td>
                      {value.variants.length > 1 ? (
                        <Button
                          type="button"
                          variant="destructive-ghost"
                          size="icon"
                          aria-label={`Don't sell ${rowLabel(value, r)}`}
                          disabled={disabled}
                          onClick={() => removeRow(i)}
                        >
                          <X />
                        </Button>
                      ) : null}
                    </Td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </TableFrame>
        {missing ? (
          <div>
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange({ ...value, variants: addMissingRows(value) })}>
              <Plus /> Add the missing combinations
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** One plain line under a column heading: what goes in it. */
function ColumnHelp({ children }: { children: string }) {
  return <span className="text-muted-foreground block text-[11px] font-normal tracking-normal normal-case">{children}</span>;
}

/** Copies the first row's value down the column. */
function ApplyAll({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="text-primary mt-0.5 block text-[11px] font-medium tracking-normal normal-case hover:underline disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Use the first row's ${label} for every variant`}
    >
      Apply first to all
    </button>
  );
}

function CellError({ text }: { text: string }) {
  return <p className="text-destructive mt-1 text-[11.5px] leading-tight">{text}</p>;
}

/** One option: its name, its values (in order), and a field to add another. */
function OptionRow({
  option,
  index,
  errors,
  disabled,
  onChange,
  onRemove,
}: {
  option: OptionInputDTO;
  index: number;
  errors: Record<string, string>;
  disabled?: boolean;
  onChange: (next: OptionInputDTO) => void;
  onRemove: () => void;
}) {
  const [adding, setAdding] = useState("");
  const f = `options[${index}]`;
  const addValue = () => {
    const value = adding.trim();
    if (!value) return;
    if (option.values.some((v) => v.value.trim().toLowerCase() === value.toLowerCase())) {
      setAdding("");
      return;
    }
    onChange({ ...option, values: [...option.values, { id: newId(), value, position: option.values.length }] });
    setAdding("");
  };
  const valueError = Object.entries(errors).find(([k]) => k.startsWith(`${f}.values`))?.[1];

  return (
    <div className="border-border grid gap-3 rounded-[var(--radius)] border p-3.5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-[200px] flex-1 gap-1.5">
          <Label htmlFor={`opt-${option.id}`}>Option {index + 1}</Label>
          <Input
            id={`opt-${option.id}`}
            placeholder={index === 0 ? "Size" : "Flavour"}
            value={option.name}
            disabled={disabled}
            aria-invalid={!!errors[`${f}.name`]}
            onChange={(e) => onChange({ ...option, name: e.target.value })}
          />
        </div>
        <Button type="button" variant="destructive-ghost" size="sm" disabled={disabled} onClick={onRemove}>
          Remove option
        </Button>
      </div>
      {errors[`${f}.name`] ? <p className="text-destructive text-xs">{errors[`${f}.name`]}</p> : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {option.values.map((v) => (
          <span key={v.id} className="border-border bg-muted inline-flex items-center gap-1 rounded-md border py-0.5 pr-0.5 pl-2 text-[13px]">
            {v.value}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`Remove ${v.value}`}
              disabled={disabled}
              onClick={() => onChange({ ...option, values: option.values.filter((x) => x.id !== v.id).map((x, i) => ({ ...x, position: i })) })}
            >
              <X className="size-3.5" />
            </Button>
          </span>
        ))}
        {option.values.length < VARIANT_LIMITS.valuesPerOption ? (
          <div className="flex items-center gap-1.5">
            <Input
              aria-label={`Add a value to ${option.name || `option ${index + 1}`}`}
              placeholder={index === 0 ? "500 g" : "Plain"}
              className="h-8 w-[140px]"
              value={adding}
              disabled={disabled}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addValue();
                }
              }}
            />
            <Button type="button" variant="outline" size="sm" disabled={disabled || adding.trim() === ""} onClick={addValue}>
              Add
            </Button>
          </div>
        ) : null}
      </div>
      {errors[`${f}.values`] || valueError ? <p className="text-destructive text-xs">{errors[`${f}.values`] ?? valueError}</p> : null}
    </div>
  );
}
