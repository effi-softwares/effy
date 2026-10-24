import type { ReactNode } from "react";

import {
  Button,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@effy/design-system/ui";

import { cn } from "@/lib/utils";

/**
 * The shell every focused-edit dialog shares: a small `Dialog` scoped to one field/group, with
 * a save button, inline (non-leaking) error copy, and — when the save hit a 409 — a "Reload" affordance
 * in place of retry. No cards (doctrine-2); the body is plain form rows. Reachable
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
  /**
   * `default` (512px) for a dialog of one or two fields; `wide` (768px) for one carrying many — the
   * basics and attribute editors lay their fields out in columns, which a 512px dialog stacks into a
   * tall scroll with half the screen unused beside it. Below the `sm` breakpoint both are full width.
   */
  /** `full` fits the sizes table (a column per price, code and weight). */
  size?: "default" | "wide" | "full";
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
  size = "default",
  children,
}: FocusedEditDialogProps) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent
        className={cn(
          "max-h-[90vh] overflow-y-auto max-md:max-h-[92dvh] max-md:pb-[env(safe-area-inset-bottom)] max-md:[&>*:not([data-slot])]:px-4",
          size === "full" ? "sm:max-w-6xl" : size === "wide" ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>{title}</ResponsiveModalTitle>
          {description ? <ResponsiveModalDescription>{description}</ResponsiveModalDescription> : null}
        </ResponsiveModalHeader>

        <div className="space-y-4">{children}</div>

        {error ? <p className="text-sm font-medium">{error}</p> : null}

        <ResponsiveModalFooter>
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
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
