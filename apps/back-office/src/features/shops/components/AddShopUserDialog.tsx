import { useState } from "react";

import { useForm } from "@tanstack/react-form";

import type { ShopRole } from "@effy/shared-types";
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

import { track } from "@/lib/telemetry";

import { shopMutationError } from "../errorText";
import { useAddShopUser } from "../queries";

// Provision a shop user (POST /admin/v1/shops/{id}/users). Role is a Select; emits
// shop_user_provisioned on success.
export interface AddShopUserDialogProps {
  shopId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLE_LABELS: Record<ShopRole, string> = {
  shop_manager: "Shop manager",
  shop_staff: "Shop staff",
};

export function AddShopUserDialog({ shopId, open, onOpenChange }: AddShopUserDialogProps) {
  const addUser = useAddShopUser(shopId);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      role: "shop_staff" as ShopRole,
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await addUser.mutateAsync({
          name: value.name.trim(),
          email: value.email.trim(),
          role: value.role,
        });
        track({ name: "shop_user_provisioned", shopId });
        form.reset();
        onOpenChange(false);
      } catch (err) {
        setFormError(shopMutationError(err, "A user with that email is already on this shop."));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add shop user</DialogTitle>
          <DialogDescription>Provision an operator for this shop.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-4"
          noValidate
        >
          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="user-name">Name</Label>
                <Input
                  id="user-name"
                  autoFocus
                  required
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  required
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="role">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="user-role">Role</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(v as ShopRole)}
                >
                  <SelectTrigger id="user-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shop_manager">{ROLE_LABELS.shop_manager}</SelectItem>
                    <SelectItem value="shop_staff">{ROLE_LABELS.shop_staff}</SelectItem>
                  </SelectContent>
                </Select>
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
                  {isSubmitting ? "Adding…" : "Add user"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
