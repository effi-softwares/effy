import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@effy/design-system/ui";

import { track } from "@/lib/telemetry";

import { shopMutationError } from "../errorText";
import { useDeleteShop } from "../queries";

// Explicit-confirm shop removal (DELETE /admin/v1/shops/{id}) via alert-dialog. Emits shop_deleted;
// navigates away on success (the shop no longer exists).
export interface RemoveShopDialogProps {
  shopId: string;
  shopName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved: () => void;
}

export function RemoveShopDialog({
  shopId,
  shopName,
  open,
  onOpenChange,
  onRemoved,
}: RemoveShopDialogProps) {
  const deleteShop = useDeleteShop(shopId);
  const [formError, setFormError] = useState<string | null>(null);

  async function confirm() {
    setFormError(null);
    try {
      await deleteShop.mutateAsync();
      track({ name: "shop_deleted", shopId });
      onOpenChange(false);
      onRemoved();
    } catch (err) {
      setFormError(shopMutationError(err));
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {shopName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the shop and its roster. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteShop.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
            disabled={deleteShop.isPending}
          >
            {deleteShop.isPending ? "Removing…" : "Remove shop"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
