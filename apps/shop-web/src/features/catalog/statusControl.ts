import type { ProductStatus, ShopReviewState } from "@effy/shared-types"

interface StatusTransition {
  status: ProductStatus
  label: string
}

export function availableTransitions(status: ProductStatus): StatusTransition[] {
  switch (status) {
    case "draft":
      return []
    case "active":
      return [
        { status: "unavailable", label: "Make unavailable" },
        { status: "archived", label: "Archive" },
      ]
    case "unavailable":
      return [
        { status: "active", label: "Make available" },
        { status: "archived", label: "Archive" },
      ]
    case "archived":
      return [{ status: "active", label: "Reactivate" }]
    default:
      return []
  }
}

export function canHardDelete(status: ProductStatus): boolean {
  return status === "draft"
}

export function deleteGuardMessage(status: ProductStatus): string {
  if (canHardDelete(status)) {
    return "This draft has never been on sale, so it can be permanently deleted. This cannot be undone."
  }
  return "A published product can't be deleted — archive it instead. Archiving hides it from the catalog but keeps its data."
}

interface VisibilityAction {
  kind: "status" | "submit" | "withdraw"
  label: string
  target: ProductStatus
  confirmTitle: string
  confirmBody: string
  confirmLabel: string
}

/** Effy's hold, and a product Effy is still setting up, leave the shop no status to change (102). */
export function effyHasIt(reviewState: ShopReviewState | undefined, held: boolean): boolean {
  return held || reviewState === "effy_setup"
}

export function visibilityAction(
  status: ProductStatus,
  reviewState?: ShopReviewState,
  held = false,
): VisibilityAction | null {
  if (effyHasIt(reviewState, held)) return null
  switch (status) {
    case "draft":
      if (reviewState === "in_review") {
        return {
          kind: "withdraw",
          label: "Withdraw",
          target: "draft",
          confirmTitle: "Withdraw this product from review?",
          confirmBody:
            "Effy stops reviewing it and it goes back to being a draft. Nothing you entered is lost, and you can submit it again when it is ready.",
          confirmLabel: "Withdraw",
        }
      }
      return {
        kind: "submit",
        label: reviewState === "sent_back" ? "Submit again" : "Submit for review",
        target: "draft",
        confirmTitle: "Submit this product for review?",
        confirmBody:
          "Effy checks it and sets the price customers pay. It goes on sale when it is approved — not before. You will be told either way, and you can keep adjusting stock while you wait.",
        confirmLabel: "Submit for review",
      }
    case "active":
      return {
        kind: "status",
        label: "Unpublish",
        target: "unavailable",
        confirmTitle: "Unpublish this product?",
        confirmBody:
          "It disappears from the storefront straight away and nobody can buy it. Nothing is deleted — the product, its images and its stock count all stay exactly as they are, and orders already placed are unaffected.",
        confirmLabel: "Unpublish",
      }
    case "unavailable":
      return {
        kind: "status",
        label: "Publish",
        target: "active",
        confirmTitle: "Put this product back on sale?",
        confirmBody: "It returns to the storefront straight away with the price and stock count it has now.",
        confirmLabel: "Publish",
      }
    case "archived":
      return {
        kind: "status",
        label: "Restore",
        target: "active",
        confirmTitle: "Restore this product?",
        confirmBody:
          "It comes back on sale in the storefront with everything it had when it was archived, including its stock count.",
        confirmLabel: "Restore",
      }
    default:
      return null
  }
}

interface RemovalAction {
  kind: "delete" | "archive"
  label: string
  confirmTitle: string
  confirmBody: string
  confirmLabel: string
}

export function removalAction(
  status: ProductStatus,
  reviewState?: ShopReviewState,
  held = false,
): RemovalAction | null {
  if (status === "archived" || effyHasIt(reviewState, held)) return null
  if (canHardDelete(status)) {
    return {
      kind: "delete",
      label: "Delete draft",
      confirmTitle: "Delete this draft?",
      confirmBody: deleteGuardMessage(status),
      confirmLabel: "Delete permanently",
    }
  }
  return {
    kind: "archive",
    label: "Archive product",
    confirmTitle: "Archive this product?",
    confirmBody:
      "Archiving takes it off the storefront and out of the working catalog, but keeps the product, its images, its stock count and its history. You can restore it at any time.",
    confirmLabel: "Archive",
  }
}
