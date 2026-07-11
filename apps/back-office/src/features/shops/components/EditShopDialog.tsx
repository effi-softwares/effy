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

import { track } from "@/lib/telemetry";

import type { ShopDetail } from "../model";
import { shopMutationError } from "../errorText";
import { useUpdateShop } from "../queries";

// Edit mutable shop details (PATCH /admin/v1/shops/{id}). The code is immutable (A9), shown
// read-only. Emits shop_updated on success.
export interface EditShopDialogProps {
  shop: ShopDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditShopDialog({ shop, open, onOpenChange }: EditShopDialogProps) {
  const updateShop = useUpdateShop(shop.id);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: shop.name,
      contactPhone: shop.contactPhone ?? "",
      notes: shop.notes ?? "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await updateShop.mutateAsync({
          name: value.name.trim(),
          contactPhone: value.contactPhone.trim() || null,
          notes: value.notes.trim() || null,
        });
        track({ name: "shop_updated", shopId: shop.id });
        onOpenChange(false);
      } catch (err) {
        setFormError(shopMutationError(err));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit shop</DialogTitle>
          <DialogDescription>Update the shop's details. The code cannot change.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="edit-code">Code</Label>
            <Input id="edit-code" value={shop.code} disabled readOnly />
          </div>
          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  autoFocus
                  required
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="contactPhone">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Contact phone</Label>
                <Input
                  id="edit-phone"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="notes">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Input
                  id="edit-notes"
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
                  {isSubmitting ? "Saving…" : "Save changes"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
