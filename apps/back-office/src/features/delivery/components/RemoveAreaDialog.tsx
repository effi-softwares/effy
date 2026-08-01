import { PostcodeCoverageNotice } from "@effy/web-kit/console";
import { useQuery } from "@tanstack/react-query";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@effy/design-system/ui";

import { postcodeCoverageQuery } from "../queries";


/**
 * Confirm removing a delivery area (031 FR-007).
 *
 * ── ⚠ Why removal needs a dialog at all ────────────────────────────────────────────────────────
 *
 * Removal is the **more dangerous direction**. Adding an area serves people who were not being
 * served; removing one **stops serving people who were** — and it does so silently, because nothing
 * about a shopper's next visit announces that the store used to deliver to them.
 *
 * And it is not one place. Serviceability is decided by postcode, so removing "Alfredton" stops
 * serving all **20** Ballarat localities. FR-007 requires that to be stated before it happens, with
 * the same disclosure the add path carries.
 */
export interface RemoveAreaDialogProps {
  postcode: string | null;
  pending: boolean;
  onConfirm: (postcode: string) => void;
  onOpenChange: (open: boolean) => void;
}

export function RemoveAreaDialog({
  postcode,
  pending,
  onConfirm,
  onOpenChange,
}: RemoveAreaDialogProps) {
  const coverage = useQuery(postcodeCoverageQuery(postcode));

  return (
    <Dialog open={!!postcode} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove this area?</DialogTitle>
          <DialogDescription>
            Shoppers here will be told Effy does not deliver to them.
          </DialogDescription>
        </DialogHeader>

        {/* ⚠ The same component the add path uses, flipped to say what STOPS being served. */}
        <PostcodeCoverageNotice coverage={coverage.data} mode="remove" />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending || !postcode}
            onClick={() => postcode && onConfirm(postcode)}
          >
            {pending ? "Removing…" : "Remove area"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
