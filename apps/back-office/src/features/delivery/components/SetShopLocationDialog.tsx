import { useState } from "react";

import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";

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
} from "@effy/design-system/ui";

import { deliveryMutationError } from "../errorText";
import { shopOptionsQuery, useSetShopLocation } from "../queries";

// Set a shop's origin postcode (PATCH /admin/v1/shops/{id}/location). The postcode resolves to an
// origin zone which determines the legs the shop can serve. Clearing it (blank) makes the shop's
// packages undeliverable — a safe explicit state (FR-017). Never exposed to customers (FR-019).
export interface SetShopLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SetShopLocationDialog({ open, onOpenChange }: SetShopLocationDialogProps) {
  const { data: shops } = useQuery(shopOptionsQuery());
  const setLocation = useSetShopLocation();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { shopId: "", postcode: "" },
    onSubmit: async ({ value }) => {
      setFormError(null);
      if (!value.shopId) {
        setFormError("Choose a shop.");
        return;
      }
      const postcode = value.postcode.trim() || null;
      try {
        await setLocation.mutateAsync({ shopId: value.shopId, body: { postcode } });
        form.reset();
        onOpenChange(false);
      } catch (err) {
        setFormError(deliveryMutationError(err));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set shop location</DialogTitle>
          <DialogDescription>
            A shop's origin postcode. Leave the postcode blank to clear it (the shop's packages become
            undeliverable).
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
          <form.Field name="shopId">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="loc-shop">Shop</Label>
                <Select value={field.state.value} onValueChange={(v) => field.handleChange(v)}>
                  <SelectTrigger id="loc-shop">
                    <SelectValue placeholder="Select a shop…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(shops ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.code} — {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>
          <form.Field name="postcode">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="loc-postcode">Postcode</Label>
                <Input
                  id="loc-postcode"
                  inputMode="numeric"
                  placeholder="3000"
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
                  {isSubmitting ? "Saving…" : "Save location"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
