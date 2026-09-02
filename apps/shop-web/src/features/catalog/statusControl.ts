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

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * 057 — the two named actions the mockup gives this screen, instead of one "Change status" menu.
 *
 * ⚠ WHY THE MENU WENT. The imported mockup puts ONE verb in the header ("Unpublish" / "Publish" /
 * "Restore") and ONE at the foot of the rail ("Archive product"), and it is right to: a dropdown
 * called "Change status" makes an operator open a menu to find out what it can even do, and then
 * makes them translate "make unavailable" into the thing they actually want, which is "take it off
 * the storefront". The transitions are unchanged — every one of `availableTransitions` is still
 * reachable — but each now arrives as the word for the outcome.
 *
 * ⚠ AND THE TWO NEVER OVERLAP. An archived product's way back is the header's "Restore"; the rail
 * offers nothing, because a second control doing the same thing is how two buttons drift apart.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

export interface VisibilityAction {
  /** The verb on the button — the outcome, never the internal status name. */
  label: string;
  target: ProductStatus;
  confirmTitle: string;
  /** What actually happens, in the operator's terms. Shown in the confirmation. */
  confirmBody: string;
  /** The word on the confirming button, matching `label` so the two read as one action. */
  confirmLabel: string;
}

/**
 * The storefront-visibility action for a status, or null when there is none.
 *
 * ⚠ `unavailable` AND `draft` BOTH PUBLISH TO `active`, and that is not a shortcut: the state machine
 * (data-model §4) has exactly one on-sale state, so "put this on sale" has exactly one destination.
 * Reading the two as different actions is what produced the six-item menu this replaces.
 */
export function visibilityAction(status: ProductStatus): VisibilityAction | null {
  switch (status) {
    case "draft":
      return {
        label: "Publish",
        target: "active",
        confirmTitle: "Publish this product?",
        confirmBody:
          "It goes on sale in the Effy storefront straight away. Shoppers can buy it as soon as it is published, so check the price and the stock count first.",
        confirmLabel: "Publish",
      };
    case "active":
      return {
        label: "Unpublish",
        target: "unavailable",
        confirmTitle: "Unpublish this product?",
        confirmBody:
          "It disappears from the storefront straight away and nobody can buy it. Nothing is deleted — the product, its images and its stock count all stay exactly as they are, and orders already placed are unaffected.",
        confirmLabel: "Unpublish",
      };
    case "unavailable":
      return {
        label: "Publish",
        target: "active",
        confirmTitle: "Put this product back on sale?",
        confirmBody:
          "It returns to the storefront straight away with the price and stock count it has now.",
        confirmLabel: "Publish",
      };
    case "archived":
      return {
        label: "Restore",
        target: "active",
        confirmTitle: "Restore this product?",
        confirmBody:
          "It comes back on sale in the storefront with everything it had when it was archived, including its stock count.",
        confirmLabel: "Restore",
      };
    default:
      return null;
  }
}

export interface RemovalAction {
  /** `delete` is permanent and only ever offered for a draft; `archive` is the reversible one. */
  kind: "delete" | "archive";
  label: string;
  confirmTitle: string;
  confirmBody: string;
  confirmLabel: string;
}

/**
 * The removal action at the foot of the rail, or null when there is none.
 *
 * ⚠ NULL FOR AN ARCHIVED PRODUCT. It is already removed; the only thing left to do to it is restore
 * it, and the header does that.
 */
export function removalAction(status: ProductStatus): RemovalAction | null {
  if (status === "archived") return null;
  if (canHardDelete(status)) {
    return {
      kind: "delete",
      label: "Delete draft",
      confirmTitle: "Delete this draft?",
      confirmBody: deleteGuardMessage(status),
      confirmLabel: "Delete permanently",
    };
  }
  return {
    kind: "archive",
    label: "Archive product",
    confirmTitle: "Archive this product?",
    confirmBody:
      "Archiving takes it off the storefront and out of the working catalog, but keeps the product, its images, its stock count and its history. You can restore it at any time.",
    confirmLabel: "Archive",
  };
}
