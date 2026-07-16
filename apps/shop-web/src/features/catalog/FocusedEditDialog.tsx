import type { ReactNode } from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@effy/design-system/ui";

/**
 * The shell every focused-edit dialog shares (US4): a small `Dialog` scoped to ONE field/group, with
 * a save button, inline (non-leaking) error copy, and — when the save hit a 409 — a "Reload" affordance
 * in place of retry (FR-023a). No cards (DOCTRINE-2); the body is plain form rows. Reachable
 * desktop→mobile-web: the Dialog is height-capped + scrollable so it fits a narrow viewport.
 */
export interface FocusedEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** True when the save may proceed (all local validation met). */
  canSave: boolean;
  saving: boolean;
  /** Inline failure copy (never raw server `detail`). */
  error: string | null;
  /** Set by a 409 — swaps the save for a reload. */
  stale: boolean;
  onReload: () => void;
  onSave: () => void;
  children: ReactNode;
}

export function FocusedEditDialog({
  open,
  onOpenChange,
  title,
  description,
  canSave,
  saving,
  error,
  stale,
  onReload,
  onSave,
  children,
}: FocusedEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="space-y-4">{children}</div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          {stale ? (
            <Button type="button" variant="outline" onClick={onReload}>
              Reload
            </Button>
          ) : (
            <Button type="button" onClick={onSave} disabled={!canSave || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
