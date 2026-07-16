import { useState } from "react";

import type { SchemaStatus } from "@effy/shared-types";
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
} from "@effy/design-system/ui";

import { catalogMutationError } from "../errorText";

// Retire / activate a schema entity (product type, attribute, or category). Activating is direct;
// retiring is confirmed (and may be refused 409 if the entity is still in use — FR-006), so the
// confirm dialog surfaces that conflict inline. `mutate` is the per-id status mutation's mutateAsync
// supplied by the row (which owns the hook), keeping this control entity-agnostic.
export interface RetireControlProps {
  status: SchemaStatus;
  entityLabel: string;
  mutate: (body: { status: SchemaStatus }) => Promise<unknown>;
  pending: boolean;
}

export function RetireControl({ status, entityLabel, mutate, pending }: RetireControlProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    setError(null);
    try {
      await mutate({ status: "active" });
    } catch {
      /* transient failures surface via the list's own error handling on refetch */
    }
  }

  async function confirmRetire() {
    setError(null);
    try {
      await mutate({ status: "retired" });
      setOpen(false);
    } catch (err) {
      setError(catalogMutationError(err, `This ${entityLabel} is in use and can't be retired.`));
    }
  }

  if (status === "retired") {
    return (
      <Button variant="outline" size="sm" disabled={pending} onClick={activate}>
        Activate
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => setOpen(true)}>
        Retire
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire this {entityLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Retired {entityLabel}s stay on existing products but are hidden from new ones. You can
              activate it again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmRetire();
              }}
              disabled={pending}
            >
              {pending ? "Retiring…" : "Retire"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
