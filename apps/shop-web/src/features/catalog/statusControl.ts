import type { ProductStatus } from "@effy/shared-types";

/**
 * Pure lifecycle logic for the status menu + delete guard (US5 — no React, unit-testable).
 *
 * Mirrors the `product.status` state machine (data-model §4). The BACKEND is authoritative — it
 * re-validates every transition and refuses a hard delete of anything but an unreferenced draft; this
 * only decides which controls to offer and what copy to show, so the UI never dangles a dead action.
 */

export interface StatusTransition {
  status: ProductStatus;
  label: string;
}

/**
 * The transitions offered from a given status.
 *   draft        → publish
 *   active       → make unavailable, archive
 *   unavailable  → make available (→active), archive
 *   archived     → reactivate (→active)
 */
export function availableTransitions(status: ProductStatus): StatusTransition[] {
  switch (status) {
    case "draft":
      return [{ status: "active", label: "Publish" }];
    case "active":
      return [
        { status: "unavailable", label: "Make unavailable" },
        { status: "archived", label: "Archive" },
      ];
    case "unavailable":
      return [
        { status: "active", label: "Make available" },
        { status: "archived", label: "Archive" },
      ];
    case "archived":
      return [{ status: "active", label: "Reactivate" }];
    default:
      return [];
  }
}

/** A hard delete is only ever possible from `draft` (the backend refuses everything else). */
export function canHardDelete(status: ProductStatus): boolean {
  return status === "draft";
}

/**
 * The copy the delete dialog shows for a status that cannot be hard-deleted — archive is the default
 * "remove" for anything that has left `draft`. Drafts get the destructive confirmation instead.
 */
export function deleteGuardMessage(status: ProductStatus): string {
  if (canHardDelete(status)) {
    return "This draft has never been published, so it can be permanently deleted. This cannot be undone.";
  }
  return "A published product can't be deleted — archive it instead. Archiving hides it from the catalog but keeps its data.";
}
