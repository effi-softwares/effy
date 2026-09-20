import { useState } from "react";

import type { AustralianState } from "@effy/shared-types";

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
      // ⚠ 061: where a driver is told to collect from. Address only — no coordinates (FR-031).
      addressLine1: shop.address?.addressLine1 ?? "",
      addressLine2: shop.address?.addressLine2 ?? "",
      suburb: shop.address?.suburb ?? "",
      postcode: shop.address?.postcode ?? "",
      state: shop.address?.state ?? "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await updateShop.mutateAsync({
          name: value.name.trim(),
          contactPhone: value.contactPhone.trim() || null,
          notes: value.notes.trim() || null,
          // ⚠ An empty box means CLEAR, so `null` is sent rather than the key being dropped. The
          // service reads the PRESENCE of a key — 056's lesson, where COALESCE collapsed "leave
          // alone" and "clear" into one and a zone once assigned could never be un-assigned.
          addressLine1: value.addressLine1.trim() || null,
          addressLine2: value.addressLine2.trim() || null,
          suburb: value.suburb.trim() || null,
          postcode: value.postcode.trim() || null,
          state: (value.state.trim() || null) as AustralianState | null,
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
          {/* ⚠ 061 — where the shop physically is, so a driver can be told where to collect from.
              A customer NEVER sees this: hidden fulfilment is a platform invariant, guarded by a
              source test in the admin service. */}
          <form.Field name="addressLine1">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="edit-addr1">Street address</Label>
                <Input
                  id="edit-addr1"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="addressLine2">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="edit-addr2">Unit, level or building</Label>
                <Input
                  id="edit-addr2"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>
          <div className="grid grid-cols-3 gap-3">
            <form.Field name="suburb">
              {(field) => (
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-suburb">Suburb</Label>
                  <Input
                    id="edit-suburb"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="postcode">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="edit-postcode">Postcode</Label>
                  <Input
                    id="edit-postcode"
                    inputMode="numeric"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </form.Field>
          </div>
          <form.Field name="state">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="edit-state">State</Label>
                <select
                  id="edit-state"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                >
                  <option value="">Not recorded</option>
                  {["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"].map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
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
