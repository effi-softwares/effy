import type { ProductStatus, ProductStockDTO } from "@effy/shared-types";
import { Badge } from "@effy/design-system/ui";

/**
 * A product's state as one chip.
 *
 * ⚠ THE FIVE-TONE MAPPING, now that the platform has one. This used to be weight-based because there
 * was no colour that meant "running low"; the theme adoption supplies `--warning`, so low stock reads
 * amber and an EMPTY shelf reads destructive — two different statements that the monochrome version
 * had to collapse into one.
 *
 * ⚠ AND STOCK OVERRIDES THE LIFECYCLE LABEL WHEN IT HAS TO. The imported mockup's header pill reads
 * "Low stock" / "Out of stock" rather than the lifecycle state, and it is right to: a product whose
 * shelf is empty is `active` in the database and UNBUYABLE in the shop, and a chip that says "active"
 * beside an empty shelf answers the wrong question. `stock` is OPTIONAL, so a surface that has not
 * read it — the catalog table, which carries no per-row count — degrades to the lifecycle label
 * instead of inventing one. One component, one vocabulary, two levels of knowledge.
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
  // ⚠ Only an `active` product's stock changes the answer. An archived product with an empty shelf is
  // archived — saying "Out of stock" would imply restocking it would put it back on sale.
  if (status === "active" && stock?.tracked) {
    // ⚠ Out of stock is DESTRUCTIVE, not warning: the product cannot be sold at all. Low stock still
    // can be. Rendering both amber is what made "low" and "none" look like the same problem.
    if (stock.outOfStock) return <Badge variant="destructive">Out of stock</Badge>;
    if (stock.low) return <Badge variant="warning">Low stock</Badge>;
  }
  return <Badge variant={VARIANT[status]}>{status}</Badge>;
}
