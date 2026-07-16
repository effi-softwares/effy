import { useState } from "react";

import { useForm } from "@tanstack/react-form";
import { Plus, Trash2, X } from "lucide-react";

import type { AttributeDataType, AttributeValidationDTO } from "@effy/shared-types";
import { ATTRIBUTE_DATA_TYPES } from "@effy/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@effy/design-system/ui";

import { track } from "@/lib/telemetry";

import { catalogMutationError } from "../errorText";
import type { AttributeDefinition } from "../model";
import { useCreateAttribute, useDeleteAllowedValue, useUpdateAttribute } from "../queries";

// Create or edit a reusable attribute definition. On create the `key` and `dataType` are set once
// (UpdateAttributeDefinitionRequest carries neither — the data type drives the value column, so it
// is immutable). The allowed-values editor is only shown for the select data types: existing values
// are removed via the dedicated DELETE endpoint (blocked 409 if a product uses one, FR-006), while
// newly-added values ride the PATCH/POST body.
export interface AttributeDialogProps {
  attribute?: AttributeDefinition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DATA_TYPE_LABELS: Record<AttributeDataType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  number: "Number",
  boolean: "Yes / no",
  single_select: "Single select",
  multi_select: "Multi select",
};

interface NewValue {
  value: string;
  label: string;
}

function buildValidation(
  min: string,
  max: string,
  maxLength: string,
): AttributeValidationDTO | null {
  const v: AttributeValidationDTO = {};
  if (min.trim() !== "") v.min = Number(min);
  if (max.trim() !== "") v.max = Number(max);
  if (maxLength.trim() !== "") v.maxLength = Number(maxLength);
  return Object.keys(v).length > 0 ? v : null;
}

export function AttributeDialog({ attribute, open, onOpenChange }: AttributeDialogProps) {
  const isEdit = Boolean(attribute);
  const createAttribute = useCreateAttribute();
  const updateAttribute = useUpdateAttribute(attribute?.id ?? "");
  const deleteAllowedValue = useDeleteAllowedValue(attribute?.id ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [dataType, setDataType] = useState<AttributeDataType>(
    attribute?.dataType ?? "short_text",
  );
  const [newValues, setNewValues] = useState<NewValue[]>([]);

  const isSelect = dataType === "single_select" || dataType === "multi_select";

  const form = useForm({
    defaultValues: {
      key: attribute?.key ?? "",
      name: attribute?.name ?? "",
      unit: attribute?.unit ?? "",
      helpText: attribute?.helpText ?? "",
      min: attribute?.validation?.min != null ? String(attribute.validation.min) : "",
      max: attribute?.validation?.max != null ? String(attribute.validation.max) : "",
      maxLength:
        attribute?.validation?.maxLength != null ? String(attribute.validation.maxLength) : "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const validation = buildValidation(value.min, value.max, value.maxLength);
      const allowedValues = isSelect
        ? newValues
            .filter((v) => v.value.trim())
            .map((v, i) => ({
              value: v.value.trim(),
              label: v.label.trim() || v.value.trim(),
              displayOrder: (attribute?.allowedValues.length ?? 0) + i,
            }))
        : undefined;
      try {
        if (attribute) {
          await updateAttribute.mutateAsync({
            name: value.name.trim(),
            unit: value.unit.trim() || null,
            helpText: value.helpText.trim() || null,
            validation,
            ...(allowedValues && allowedValues.length > 0 ? { allowedValues } : {}),
          });
        } else {
          const created = await createAttribute.mutateAsync({
            key: value.key.trim(),
            name: value.name.trim(),
            dataType,
            unit: value.unit.trim() || null,
            helpText: value.helpText.trim() || null,
            validation,
            ...(allowedValues ? { allowedValues } : {}),
          });
          track({ name: "schema_attribute_created", attributeId: created.id });
        }
        form.reset();
        setNewValues([]);
        onOpenChange(false);
      } catch (err) {
        setFormError(catalogMutationError(err, "An attribute with that key already exists."));
      }
    },
  });

  function addNewValue() {
    setNewValues((prev) => [...prev, { value: "", label: "" }]);
  }

  function removeExistingValue(valueId: string) {
    deleteAllowedValue.mutate(valueId, {
      onError: (err) =>
        setFormError(catalogMutationError(err, "That value is in use and can't be removed.")),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit attribute" : "Create attribute"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the attribute. Its key and data type cannot change."
              : "A reusable attribute you can assign to any product type."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="max-h-[70vh] space-y-4 overflow-y-auto"
          noValidate
        >
          <div className="grid grid-cols-2 gap-3">
            {isEdit ? (
              <div className="space-y-2">
                <Label htmlFor="attr-key">Key</Label>
                <Input id="attr-key" value={attribute?.key ?? ""} disabled readOnly />
              </div>
            ) : (
              <form.Field name="key">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="attr-key">Key</Label>
                    <Input
                      id="attr-key"
                      required
                      placeholder="spice_level"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </form.Field>
            )}
            <div className="space-y-2">
              <Label htmlFor="attr-data-type">Data type</Label>
              {isEdit ? (
                <Input
                  id="attr-data-type"
                  value={DATA_TYPE_LABELS[dataType]}
                  disabled
                  readOnly
                />
              ) : (
                <Select
                  value={dataType}
                  onValueChange={(v) => setDataType(v as AttributeDataType)}
                >
                  <SelectTrigger id="attr-data-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ATTRIBUTE_DATA_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {DATA_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="attr-name">Name</Label>
                <Input
                  id="attr-name"
                  required
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>

          <div className="grid grid-cols-2 gap-3">
            <form.Field name="unit">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="attr-unit">Unit (optional)</Label>
                  <Input
                    id="attr-unit"
                    placeholder="g, ml, %"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="helpText">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="attr-help">Help text (optional)</Label>
                  <Input
                    id="attr-help"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Validation (optional)</legend>
            <div className="grid grid-cols-3 gap-3">
              <form.Field name="min">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="attr-min">Min</Label>
                    <Input
                      id="attr-min"
                      type="number"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="max">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="attr-max">Max</Label>
                    <Input
                      id="attr-max"
                      type="number"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="maxLength">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="attr-maxlen">Max length</Label>
                    <Input
                      id="attr-maxlen"
                      type="number"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </form.Field>
            </div>
          </fieldset>

          {isSelect ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Allowed values</Label>
                <Button type="button" variant="outline" size="sm" onClick={addNewValue}>
                  <Plus />
                  Add value
                </Button>
              </div>
              {attribute && attribute.allowedValues.length > 0 ? (
                <ul className="divide-y rounded-md border">
                  {attribute.allowedValues.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span>
                        {v.label}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {v.value}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${v.label}`}
                        disabled={deleteAllowedValue.isPending}
                        onClick={() => removeExistingValue(v.id)}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {newValues.map((nv, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="value"
                    value={nv.value}
                    onChange={(e) =>
                      setNewValues((prev) =>
                        prev.map((p, j) => (j === i ? { ...p, value: e.target.value } : p)),
                      )
                    }
                  />
                  <Input
                    placeholder="label"
                    value={nv.label}
                    onChange={(e) =>
                      setNewValues((prev) =>
                        prev.map((p, j) => (j === i ? { ...p, label: e.target.value } : p)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove value"
                    onClick={() => setNewValues((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </section>
          ) : null}

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create attribute"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
