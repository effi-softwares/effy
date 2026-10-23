import type { ProductStatus, ProductStockDTO } from "@effy/shared-types";
import { Badge } from "@effy/design-system/ui";

/**
 * A product's state as one chip: low stock reads warning, an empty shelf destructive. Stock overrides the
 * lifecycle label (an `active` product with an empty shelf is unbuyable); `stock` is optional, so a
 * surface without it (the catalog table) shows the lifecycle label.
 */
const VARIANT: Record<ProductStatus, "brand" | "success" | "warning" | "muted"> = {
  // Work in progress — the operator has started this and not finished it.
  draft: "brand",
  active: "success",
  unavailable: "warning",
  archived: "muted",
};

export function ProductStatusBadge({
  status,
  stock,
}: {
  status: ProductStatus;
  /** Omit where the count is unknown. Never pass a guess — that is what the lifecycle label is for. */
  stock?: ProductStockDTO;
}) {
  // Only an `active` product's stock changes the answer. An archived product with an empty shelf is
  // archived — saying "Out of stock" would imply restocking it would put it back on sale.
  if (status === "active" && stock?.tracked) {
    // Out of stock is destructive, not warning: the product cannot be sold at all. Low stock still
    // can be. Rendering both amber is what made "low" and "none" look like the same problem.
    if (stock.outOfStock) return <Badge variant="destructive">Out of stock</Badge>;
    if (stock.low) return <Badge variant="warning">Low stock</Badge>;
  }
  return <Badge variant={VARIANT[status]}>{status}</Badge>;
}
