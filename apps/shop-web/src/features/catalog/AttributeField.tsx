import {
  Checkbox,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@effy/design-system/ui";

import type { ProductTypeAttribute } from "./model";
import type { AttributeDraftValue } from "./draft";

/**
 * Renders ONE back-office-authored attribute as the right input for its data type. Built reusable so
 * US4's focused edit can render the same fields. Purely controlled — it owns no state; the parent
 * holds the draft value and receives every change.
 *
 *   short_text   → Input
 *   long_text    → Textarea
 *   number       → Input[type=number] (+ unit suffix)
 *   boolean      → Switch
 *   single_select→ Select (allowedValues)
 *   multi_select → checkbox group (allowedValues)
 *
 * `unit`, `helpText`, mandatory marker, and `allowedValues` all come from the schema.
 */
export interface AttributeFieldProps {
  attr: ProductTypeAttribute;
  value: AttributeDraftValue | undefined;
  onChange: (next: AttributeDraftValue) => void;
  error?: string;
}

export function AttributeField({ attr, value, onChange, error }: AttributeFieldProps) {
  const v = value ?? {};
  const fieldId = `attr-${attr.attributeId}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>
        {attr.name}
        {attr.isMandatory ? <span className="ml-0.5 text-destructive">*</span> : null}
        {attr.unit ? <span className="ml-1 text-muted-foreground">({attr.unit})</span> : null}
      </Label>

      {renderControl(attr, v, onChange, fieldId)}

      {attr.helpText ? <p className="text-xs text-muted-foreground">{attr.helpText}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function renderControl(
  attr: ProductTypeAttribute,
  v: AttributeDraftValue,
  onChange: (next: AttributeDraftValue) => void,
  fieldId: string,
) {
  switch (attr.dataType) {
    case "short_text":
      return (
        <Input
          id={fieldId}
          value={v.text ?? ""}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      );
    case "long_text":
      return (
        <Textarea
          id={fieldId}
          value={v.text ?? ""}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      );
    case "number":
      return (
        <Input
          id={fieldId}
          type="number"
          inputMode="decimal"
          value={v.number ?? ""}
          onChange={(e) => onChange({ number: e.target.value })}
        />
      );
    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <Switch
            id={fieldId}
            checked={v.boolean ?? false}
            onCheckedChange={(checked) => onChange({ boolean: checked })}
          />
          <span className="text-sm text-muted-foreground">{v.boolean ? "Yes" : "No"}</span>
        </div>
      );
    case "single_select":
      // Radios when the option set is small, a Select when it is longer — both write `text`.
      if (attr.allowedValues.length <= 4) {
        return (
          <RadioGroup
            value={v.text ?? ""}
            onValueChange={(value) => onChange({ text: value })}
            className="gap-2"
          >
            {attr.allowedValues.map((o) => (
              <div key={o.value} className="flex items-center gap-2">
                <RadioGroupItem id={`${fieldId}-${o.value}`} value={o.value} />
                <Label htmlFor={`${fieldId}-${o.value}`} className="font-normal">
                  {o.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );
      }
      return (
        <Select value={v.text ?? ""} onValueChange={(value) => onChange({ text: value })}>
          <SelectTrigger id={fieldId}>
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {attr.allowedValues.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "multi_select": {
      const selected = new Set(v.options ?? []);
      return (
        <div className="space-y-2">
          {attr.allowedValues.map((o) => {
            const checked = selected.has(o.value);
            return (
              <div key={o.value} className="flex items-center gap-2">
                <Checkbox
                  id={`${fieldId}-${o.value}`}
                  checked={checked}
                  onCheckedChange={(next) => {
                    const set = new Set(selected);
                    if (next === true) set.add(o.value);
                    else set.delete(o.value);
                    onChange({ options: [...set] });
                  }}
                />
                <Label htmlFor={`${fieldId}-${o.value}`} className="font-normal">
                  {o.label}
                </Label>
              </div>
            );
          })}
        </div>
      );
    }
    default:
      return null;
  }
}
