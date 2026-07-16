import { useState } from "react";

import { ChevronDown, Trash2 } from "lucide-react";

import type { ProductStatus } from "@effy/shared-types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@effy/design-system/ui";

import { track } from "@/lib/telemetry";

import { productMutationError } from "./errorText";
import type { ProductDetail } from "./model";
import { useChangeStatus, useDeleteProduct } from "./queries";
import { availableTransitions, canHardDelete, deleteGuardMessage } from "./statusControl";

/**
 * The product's lifecycle controls (US5 T072): a status menu offering only the transitions valid from
 * the current status (data-model §4), and a delete affordance guarded by an `AlertDialog`. A draft can
 * be hard-deleted; anything published can only be archived (the backend refuses the delete → the dialog
 * offers archive instead). Archiving emits `product_archived`.
 */
export function LifecycleControls({
  detail,
  onDeleted,
}: {
  detail: ProductDetail;
  onDeleted: () => void;
}) {
  const changeStatus = useChangeStatus(detail.id);
  const deleteProduct = useDeleteProduct(detail.id);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const transitions = availableTransitions(detail.status);
  const deletable = canHardDelete(detail.status);
  const busy = changeStatus.isPending || deleteProduct.isPending;

  function apply(status: ProductStatus) {
    setError(null);
    changeStatus.mutate(
      { status },
      {
        onSuccess: () => {
          if (status === "archived") track({ name: "product_archived", productId: detail.id });
        },
        onError: (err) => setError(productMutationError(err)),
      },
    );
  }

  function confirmDelete() {
    // A published product's delete is refused by the backend (409) → fall back to archive.
    if (!deletable) {
      apply("archived");
      setConfirmOpen(false);
      return;
    }
    setError(null);
    deleteProduct.mutate(undefined, {
      onSuccess: () => {
        setConfirmOpen(false);
        onDeleted();
      },
      onError: (err) => setError(productMutationError(err)),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {transitions.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={busy}>
              Change status
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {transitions.map((t) => (
              <DropdownMenuItem key={t.status} onSelect={() => apply(t.status)}>
                {t.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        className="text-destructive"
        disabled={busy}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 />
        {deletable ? "Delete" : "Archive"}
      </Button>

      {error ? <span className="text-sm text-destructive">{error}</span> : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deletable ? "Delete this draft?" : "Archive this product?"}</AlertDialogTitle>
            <AlertDialogDescription>{deleteGuardMessage(detail.status)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={busy}
            >
              {deletable ? "Delete permanently" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
