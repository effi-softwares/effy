import { useState } from "react";

import { useForm } from "@tanstack/react-form";

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
  Textarea,
} from "@effy/design-system/ui";

import { track } from "@/lib/telemetry";

import { catalogMutationError } from "../errorText";
import type { ProductType } from "../model";
import { useCreateProductType, useUpdateProductType } from "../queries";

// Create or edit a product type. On create the `key` is set once (it is the stable identifier the
// seed + shop-facing schema read key on); on edit only name/description are mutable
// (UpdateProductTypeRequest carries no `key`), so the key is shown read-only. TanStack Form drives
// the fields; the mutation invalidates the catalog cache. Backend stays authoritative.
export interface ProductTypeDialogProps {
  productType?: ProductType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductTypeDialog({ productType, open, onOpenChange }: ProductTypeDialogProps) {
  const isEdit = Boolean(productType);
  const createType = useCreateProductType();
  const updateType = useUpdateProductType(productType?.id ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      key: productType?.key ?? "",
      name: productType?.name ?? "",
      description: productType?.description ?? "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        if (productType) {
          await updateType.mutateAsync({
            name: value.name.trim(),
            description: value.description.trim() || null,
          });
        } else {
          const created = await createType.mutateAsync({
            key: value.key.trim(),
            name: value.name.trim(),
            description: value.description.trim() || null,
          });
          track({ name: "schema_type_created", productTypeId: created.id });
        }
        form.reset();
        onOpenChange(false);
      } catch (err) {
        setFormError(catalogMutationError(err, "A product type with that key already exists."));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit product type" : "Create product type"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the type's details. The key cannot change."
              : "A product classification that drives the create form's attributes."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-4"
          noValidate
        >
          {isEdit ? (
            <div className="space-y-2">
              <Label htmlFor="pt-key">Key</Label>
              <Input id="pt-key" value={productType?.key ?? ""} disabled readOnly />
            </div>
          ) : (
            <form.Field name="key">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="pt-key">Key</Label>
                  <Input
                    id="pt-key"
                    autoFocus
                    required
                    placeholder="prepared_food"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </form.Field>
          )}
          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="pt-name">Name</Label>
                <Input
                  id="pt-name"
                  autoFocus={isEdit}
                  required
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="description">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="pt-description">Description (optional)</Label>
                <Textarea
                  id="pt-description"
                  rows={3}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create type"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
