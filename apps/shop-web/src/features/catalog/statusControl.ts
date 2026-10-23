import type { ProductStatus, ShopReviewState } from "@effy/shared-types";

/**
 * Pure lifecycle logic for the status menu + delete guard (US5 — no React, unit-testable).
 *
 * Mirrors the `product.status` state machine. The backend is authoritative — it
 * re-validates every transition and refuses a hard delete of anything but an unreferenced draft; this
 * only decides which controls to offer and what copy to show, so the UI never dangles a dead action.
 */

export interface StatusTransition {
  status: ProductStatus;
  label: string;
}

/**
 * The transitions offered from a given status.
 *  draft → nothing (a draft reaches the storefront by Effy's approval)
 *  active → make unavailable, archive
 *  unavailable → make available (→active), archive
 *  archived → reactivate (→active)
 */
export function availableTransitions(status: ProductStatus): StatusTransition[] {
  switch (status) {
    case "draft":
      return [];
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
    return "This draft has never been on sale, so it can be permanently deleted. This cannot be undone.";
  }
  return "A published product can't be deleted — archive it instead. Archiving hides it from the catalog but keeps its data.";
}

/**
 * The header's two named actions instead of a "Change status" menu: one verb for the outcome
 * ("Unpublish" / "Publish" / "Restore") and one removal ("Archive product"). Every transition stays
 * reachable, and the two never overlap: an archived product's way back is "Restore" only.
 */

export interface VisibilityAction {
  /**
   * What pressing it does. `status` moves the lifecycle; `submit` sends a never-approved
   * product to Effy for review; `withdraw` takes it back out of the queue.
   */
  kind: "status" | "submit" | "withdraw";
  /** The verb on the button — the outcome, never the internal status name. */
  label: string;
  /** Where a `status` action lands. Unused by `submit` / `withdraw`. */
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
 * `unavailable` and `draft` both publish to `active`, and that is not a shortcut: the state machine
 *  has exactly one on-sale state, so "put this on sale" has exactly one destination.
 * Reading the two as different actions is what produced the six-item menu this replaces.
 */
export function visibilityAction(
  status: ProductStatus,
  reviewState?: ShopReviewState,
): VisibilityAction | null {
  switch (status) {
    case "draft":
      // A shop no longer publishes. A product Effy has never approved reaches the storefront
      // one way: it is submitted, and Effy approves it. The button says so, because a "Publish" that
      // the server refuses is a control that lies about what it can do.
      if (reviewState === "in_review") {
        return {
          kind: "withdraw",
          label: "Withdraw",
          target: "draft",
          confirmTitle: "Withdraw this product from review?",
          confirmBody:
            "Effy stops reviewing it and it goes back to being a draft. Nothing you entered is lost, and you can submit it again when it is ready.",
          confirmLabel: "Withdraw",
        };
      }
      return {
        kind: "submit",
        label: reviewState === "sent_back" ? "Submit again" : "Submit for review",
        target: "draft",
        confirmTitle: "Submit this product for review?",
        confirmBody:
          "Effy checks it and sets the price customers pay. It goes on sale when it is approved — not before. You will be told either way, and you can keep adjusting stock while you wait.",
        confirmLabel: "Submit for review",
      };
    case "active":
      return {
        kind: "status",
        label: "Unpublish",
        target: "unavailable",
        confirmTitle: "Unpublish this product?",
        confirmBody:
          "It disappears from the storefront straight away and nobody can buy it. Nothing is deleted — the product, its images and its stock count all stay exactly as they are, and orders already placed are unaffected.",
        confirmLabel: "Unpublish",
      };
    case "unavailable":
      return {
        kind: "status",
        label: "Publish",
        target: "active",
        confirmTitle: "Put this product back on sale?",
        confirmBody:
          "It returns to the storefront straight away with the price and stock count it has now.",
        confirmLabel: "Publish",
      };
    case "archived":
      return {
        kind: "status",
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
 * The removal action (last in the header row), or null when there is none.
 *
 * Null for an archived product. It is already removed; the only thing left to do to it is restore
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
