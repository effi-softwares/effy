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

import { shopMutationError } from "../errorText";
import { useCreateShop } from "../queries";

// Create a shop + provision its primary manager (POST /admin/v1/shops). TanStack Form drives the
// fields; the mutation invalidates the list on success. Backend remains authoritative — a csa that
// somehow reached this dialog would still be refused server-side.
export interface CreateShopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateShopDialog({ open, onOpenChange }: CreateShopDialogProps) {
  const createShop = useCreateShop();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      code: "",
      name: "",
      contactPhone: "",
      notes: "",
      primaryContactName: "",
      primaryContactEmail: "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        const shop = await createShop.mutateAsync({
          code: value.code.trim(),
          name: value.name.trim(),
          contactPhone: value.contactPhone.trim() || null,
          notes: value.notes.trim() || null,
          primaryContact: {
            name: value.primaryContactName.trim(),
            email: value.primaryContactEmail.trim(),
          },
        });
        track({ name: "shop_created", shopId: shop.id });
        form.reset();
        onOpenChange(false);
      } catch (err) {
        setFormError(shopMutationError(err, "A shop with that code already exists."));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create shop</DialogTitle>
          <DialogDescription>
            Register a fulfillment shop and provision its primary manager.
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
                <Label htmlFor="shop-code">Code</Label>
                <Input
                  id="shop-code"
                  autoFocus
                  required
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
                <Label htmlFor="shop-name">Name</Label>
                <Input
                  id="shop-name"
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
                <Label htmlFor="shop-phone">Contact phone (optional)</Label>
                <Input
                  id="shop-phone"
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
                <Label htmlFor="shop-notes">Notes (optional)</Label>
                <Input
                  id="shop-notes"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>
          <div className="grid grid-cols-2 gap-3">
            <form.Field name="primaryContactName">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="pc-name">Primary contact name</Label>
                  <Input
                    id="pc-name"
                    required
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="primaryContactEmail">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="pc-email">Primary contact email</Label>
                  <Input
                    id="pc-email"
                    type="email"
                    required
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </form.Field>
          </div>
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creating…" : "Create shop"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
