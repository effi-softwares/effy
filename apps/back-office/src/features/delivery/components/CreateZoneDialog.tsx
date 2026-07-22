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
} from "@effy/design-system/ui";

import { deliveryMutationError } from "../errorText";
import type { DeliveryZone } from "../model";
import { useCreateZone, useUpdateZone } from "../queries";

// Create a serviced area (POST /admin/v1/delivery-zones) OR rename an existing one (PATCH, edit
// mode when `zone` is passed — the code is immutable, so only the name is editable). TanStack Form
// drives the fields; the mutation invalidates the delivery cache on success. Backend stays
// authoritative — a csa that somehow reached this dialog is still refused server-side.
export interface CreateZoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zone?: DeliveryZone; // present → edit-name mode
}

export function CreateZoneDialog({ open, onOpenChange, zone }: CreateZoneDialogProps) {
  const isEdit = Boolean(zone);
  const createZone = useCreateZone();
  const updateZone = useUpdateZone(zone?.id ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { code: zone?.code ?? "", name: zone?.name ?? "" },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        if (isEdit) {
          await updateZone.mutateAsync({ name: value.name.trim() });
        } else {
          await createZone.mutateAsync({ code: value.code.trim(), name: value.name.trim() });
        }
        form.reset();
        onOpenChange(false);
      } catch (err) {
        setFormError(deliveryMutationError(err, "A zone with that code already exists."));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Rename zone" : "Create zone"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "The zone code is permanent; only its name can change."
              : "Define a serviced area. Add its postcodes after creating it."}
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
          <form.Field name="code">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="zone-code">Code</Label>
                <Input
                  id="zone-code"
                  autoFocus={!isEdit}
                  required
                  disabled={isEdit}
                  placeholder="MEL-METRO"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="zone-name">Name</Label>
                <Input
                  id="zone-name"
                  autoFocus={isEdit}
                  required
                  placeholder="Melbourne Metro"
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
                  {isSubmitting ? "Saving…" : isEdit ? "Save" : "Create zone"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
