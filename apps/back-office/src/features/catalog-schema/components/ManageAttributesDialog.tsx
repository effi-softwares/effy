import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { X } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@effy/design-system/ui";

import { catalogMutationError } from "../errorText";
import type { ProductType } from "../model";
import {
  attributesQuery,
  useAssignAttribute,
  useUnassignAttribute,
  useUpdateAssignment,
} from "../queries";

// Manage a product type's assigned attributes (POST/PATCH/DELETE /product-types/{id}/attributes...).
// Shows the current assignments (mandatory toggle + unassign) and an assign form choosing an
// unassigned, active attribute with its per-type facts (isMandatory / displayOrder / groupLabel).
export interface ManageAttributesDialogProps {
  productType: ProductType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageAttributesDialog({
  productType,
  open,
  onOpenChange,
}: ManageAttributesDialogProps) {
  const { data: library } = useQuery({ ...attributesQuery(), enabled: open });
  const assign = useAssignAttribute(productType.id);
  const updateAssignment = useUpdateAssignment(productType.id);
  const unassign = useUnassignAttribute(productType.id);
  const [formError, setFormError] = useState<string | null>(null);

  const assignedIds = new Set(productType.attributes.map((a) => a.attributeId));
  const assignable = (library ?? []).filter(
    (a) => a.status === "active" && !assignedIds.has(a.id),
  );

  const form = useForm({
    defaultValues: {
      attributeId: "",
      isMandatory: false,
      displayOrder: String(productType.attributes.length),
      groupLabel: "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      if (!value.attributeId) {
        setFormError("Choose an attribute to assign.");
        return;
      }
      try {
        await assign.mutateAsync({
          attributeId: value.attributeId,
          isMandatory: value.isMandatory,
          displayOrder: Number(value.displayOrder) || 0,
          groupLabel: value.groupLabel.trim() || null,
        });
        form.reset();
      } catch (err) {
        setFormError(catalogMutationError(err, "That attribute is already assigned."));
      }
    },
  });

  function toggleMandatory(attrId: string, next: boolean) {
    updateAssignment.mutate({ attrId, body: { isMandatory: next } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Attributes · {productType.name}</DialogTitle>
          <DialogDescription>
            The attributes shops fill in when creating a product of this type.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <h3 className="text-sm font-medium">Assigned</h3>
          {productType.attributes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attributes assigned yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {productType.attributes
                .slice()
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map((attr) => (
                  <li
                    key={attr.attributeId}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{attr.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {attr.dataType}
                        {attr.groupLabel ? ` · ${attr.groupLabel}` : ""} · order {attr.displayOrder}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Label className="flex items-center gap-2 text-xs">
                        Mandatory
                        <Switch
                          checked={attr.isMandatory}
                          onCheckedChange={(v) => toggleMandatory(attr.attributeId, v)}
                          disabled={updateAssignment.isPending}
                        />
                      </Label>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Unassign ${attr.name}`}
                        disabled={unassign.isPending}
                        onClick={() => unassign.mutate(attr.attributeId)}
                      >
                        <X />
                      </Button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-3 border-t pt-4"
          noValidate
        >
          <h3 className="text-sm font-medium">Assign an attribute</h3>
          <form.Field name="attributeId">
            {(field) => (
              <div className="space-y-2">
                <Label>Attribute</Label>
                <Select value={field.state.value} onValueChange={field.handleChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an attribute…" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignable.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        No unassigned attributes
                      </SelectItem>
                    ) : (
                      assignable.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ({a.dataType})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>
          <div className="grid grid-cols-2 gap-3">
            <form.Field name="displayOrder">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="assign-order">Display order</Label>
                  <Input
                    id="assign-order"
                    type="number"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="groupLabel">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="assign-group">Group label (optional)</Label>
                  <Input
                    id="assign-group"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
          </div>
          <form.Field name="isMandatory">
            {(field) => (
              <Label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={field.state.value}
                  onCheckedChange={(v) => field.handleChange(v)}
                />
                Mandatory on this type
              </Label>
            )}
          </form.Field>
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting || assignable.length === 0}>
                  {isSubmitting ? "Assigning…" : "Assign"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
