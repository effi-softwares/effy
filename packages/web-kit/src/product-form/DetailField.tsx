import { useState } from "react";

import { cn } from "@effy/design-system";
import {
  Checkbox,
  DateField,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  TimeField,
  ToggleGroup,
  ToggleGroupItem,
} from "@effy/design-system/ui";
import type {
  CategoryFormRow,
  DetailInput,
  DetailValue,
  DetailVariant,
} from "@effy/shared-types";

interface Props {
  row: CategoryFormRow;
  /** What is entered now; undefined when nothing is. */
  entry: DetailInput | undefined;
  /** The product's sizes: a detail that may differ by size can be entered per size. */
  variants: readonly DetailVariant[];
  /** `null` leaves the detail out. */
  onChange: (next: DetailInput | null) => void;
  /** Messages keyed `details.<key>` and `details.<key>[<variantId>]`. */
  errors: Record<string, string>;
  disabled?: boolean;
}

const CLEAR = "__clear__";

/** One detail of the leaf's form, by its input type. Required is marked; recommended is nudged. */
export function DetailField({
  row,
  entry,
  variants,
  onChange,
  errors,
  disabled,
}: Props) {
  const canDiffer = row.variesByVariant && variants.length > 1;
  const perSize = canDiffer && entry?.perVariant !== undefined;
  const id = `detail-${row.key}`;
  const productError = errors[`details.${row.key}`];

  function setWhole(value: DetailValue | undefined) {
    onChange(
      value === undefined ? null : { attributeId: row.attributeId, value },
    );
  }

  function setFor(variantId: string, value: DetailValue | undefined) {
    const rest = (entry?.perVariant ?? []).filter(
      (p) => p.variantId !== variantId,
    );
    const perVariant =
      value === undefined ? rest : [...rest, { variantId, value }];
    onChange(
      perVariant.length === 0
        ? { attributeId: row.attributeId, perVariant: [] }
        : { attributeId: row.attributeId, perVariant },
    );
  }

  return (
    <fieldset
      className="grid gap-2"
      aria-describedby={row.helpText ? `${id}-help` : undefined}
    >
      <legend className="flex flex-wrap items-baseline gap-2 text-sm font-medium">
        <span id={`${id}-label`}>{row.name}</span>
        {row.level === "required" ? (
          <span className="text-xs font-normal text-muted-foreground">
            Required
          </span>
        ) : null}
        {row.level === "recommended" ? (
          <span className="text-xs font-normal text-primary">
            Helps shoppers find this
          </span>
        ) : null}
      </legend>

      {canDiffer ? (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label={`${row.name}: one value or one per size`}
          disabled={disabled}
          value={perSize ? "per" : "same"}
          onValueChange={(v) => {
            if (v === "same" && perSize) onChange(null);
            if (v === "per" && !perSize)
              onChange({ attributeId: row.attributeId, perVariant: [] });
          }}
        >
          <ToggleGroupItem value="same" className="px-3">
            Same for every size
          </ToggleGroupItem>
          <ToggleGroupItem value="per" className="px-3">
            Differs by size
          </ToggleGroupItem>
        </ToggleGroup>
      ) : null}

      {perSize ? (
        <div className="grid gap-3 border-l-2 border-border pl-3">
          {variants.map((v) => {
            const value = entry?.perVariant?.find(
              (p) => p.variantId === v.id,
            )?.value;
            const err = errors[`details.${row.key}[${v.id}]`];
            return (
              <div key={v.id} className="grid gap-1.5">
                <Label
                  htmlFor={`${id}-${v.id}`}
                  className="text-xs text-muted-foreground"
                >
                  {v.label}
                </Label>
                <Control
                  row={row}
                  id={`${id}-${v.id}`}
                  value={value}
                  onChange={(next) => setFor(v.id, next)}
                  disabled={disabled}
                  invalid={!!err}
                />
                {err ? <p className="text-sm font-medium">{err}</p> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <Control
          row={row}
          id={id}
          labelledBy={`${id}-label`}
          value={entry?.value}
          onChange={setWhole}
          disabled={disabled}
          invalid={!!productError}
        />
      )}

      {row.helpText ? (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {row.helpText}
        </p>
      ) : null}
      {productError ? (
        <p className="text-sm font-medium">{productError}</p>
      ) : null}
    </fieldset>
  );
}

function Control({
  row,
  id,
  labelledBy,
  value,
  onChange,
  disabled,
  invalid,
}: {
  row: CategoryFormRow;
  id: string;
  /** The legend's id, for the whole-product control (a per-size one has its own label). */
  labelledBy?: string;
  value: DetailValue | undefined;
  onChange: (next: DetailValue | undefined) => void;
  disabled?: boolean;
  invalid: boolean;
}) {
  const named = labelledBy ? { "aria-labelledby": labelledBy } : {};
  const [unit, setUnit] = useState<string>(
    () => (value && "number" in value && value.unit) || row.units[0] || "",
  );
  switch (row.inputType) {
    case "short_text":
    case "long_text": {
      const text = value && "text" in value ? value.text : "";
      const Field = row.inputType === "long_text" ? Textarea : Input;
      return (
        <Field
          id={id}
          {...named}
          value={text}
          maxLength={row.maxLength ?? undefined}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(e) =>
            onChange(
              e.target.value.trim() === ""
                ? undefined
                : { text: e.target.value },
            )
          }
        />
      );
    }
    case "number": {
      const number = value && "number" in value ? value.number : "";
      const send = (n: string, u: string) =>
        onChange(
          n.trim() === ""
            ? undefined
            : row.unitFamily
              ? { number: n, unit: u || null }
              : { number: n },
        );
      return (
        <div className="flex max-w-xs gap-2">
          <Input
            id={id}
            {...named}
            inputMode="decimal"
            value={number}
            disabled={disabled}
            aria-invalid={invalid}
            onChange={(e) => send(e.target.value, unit)}
          />
          {row.unitFamily && row.units.length > 0 ? (
            row.units.length === 1 ? (
              <span className="self-center text-sm text-muted-foreground">
                {row.units[0]}
              </span>
            ) : (
              <Select
                value={unit}
                disabled={disabled}
                onValueChange={(u) => {
                  setUnit(u);
                  if (number.trim() !== "") send(number, u);
                }}
              >
                <SelectTrigger aria-label="Unit" className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {row.units.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          ) : null}
        </div>
      );
    }
    case "boolean": {
      const b = value && "boolean" in value ? value.boolean : undefined;
      return (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-labelledby={labelledBy}
          id={id}
          disabled={disabled}
          value={b === undefined ? "" : String(b)}
          onValueChange={(v) =>
            onChange(v === "" ? undefined : { boolean: v === "true" })
          }
        >
          {([true, false] as const).map((choice) => (
            <ToggleGroupItem
              key={String(choice)}
              value={String(choice)}
              className="px-4"
            >
              {choice ? "Yes" : "No"}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      );
    }
    case "single_select": {
      const chosen =
        value && "valueIds" in value ? (value.valueIds[0] ?? "") : "";
      return (
        <Select
          value={chosen}
          disabled={disabled}
          onValueChange={(v) =>
            onChange(v === CLEAR ? undefined : { valueIds: [v] })
          }
        >
          <SelectTrigger
            id={id}
            {...named}
            className="max-w-sm"
            aria-invalid={invalid}
          >
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {chosen ? <SelectItem value={CLEAR}>Not set</SelectItem> : null}
            {row.values.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "multi_select": {
      const selected = new Set(
        value && "valueIds" in value ? value.valueIds : [],
      );
      return (
        <div
          id={id}
          role="group"
          {...named}
          className={cn(
            "grid gap-2",
            row.values.length > 6 && "sm:grid-cols-2 lg:grid-cols-3",
          )}
        >
          {row.values.map((o) => (
            <label
              key={o.id}
              className="flex min-h-9 items-center gap-2 text-sm"
            >
              <Checkbox
                checked={selected.has(o.id)}
                disabled={disabled}
                onCheckedChange={(next) => {
                  const set = new Set(selected);
                  if (next === true) set.add(o.id);
                  else set.delete(o.id);
                  // Kept in the list's order.
                  const ids = row.values
                    .map((x) => x.id)
                    .filter((x) => set.has(x));
                  onChange(ids.length === 0 ? undefined : { valueIds: ids });
                }}
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    case "date": {
      const date = value && "date" in value ? value.date : "";
      return (
        <DateField
          id={id}
          {...named}
          className="max-w-xs"
          value={date}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(v) => onChange(v ? { date: v } : undefined)}
        />
      );
    }
    case "time": {
      const time = value && "time" in value ? value.time : "";
      return (
        <TimeField
          id={id}
          {...named}
          className="max-w-xs"
          value={time}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(v) => onChange(v ? { time: v } : undefined)}
        />
      );
    }
  }
}
