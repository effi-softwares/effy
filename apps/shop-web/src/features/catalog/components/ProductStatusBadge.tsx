import type { ProductStatus, ProductStockDTO } from "@effy/shared-types";
import { Badge } from "@effy/design-system/ui";

/**
 * A product's state as one chip.
 *
 * ⚠ MONOCHROME. The variants carry meaning by WEIGHT, not hue: solid = affirmative/current, outline =
 * needs attention, muted = lowest emphasis. `Badge`'s own comment records why — the platform has two
 * semantic colours, neither of which means "running low", and 041 swept amber out of these very
 * screens.
 *
 * ⚠ AND STOCK OVERRIDES THE LIFECYCLE LABEL WHEN IT HAS TO. The imported mockup's header pill reads
 * "Low stock" / "Out of stock" rather than the lifecycle state, and it is right to: a product whose
 * shelf is empty is `active` in the database and UNBUYABLE in the shop, and a chip that says "active"
 * beside an empty shelf answers the wrong question. `stock` is OPTIONAL, so a surface that has not
 * read it — the catalog table, which carries no per-row count — degrades to the lifecycle label
 * instead of inventing one. One component, one vocabulary, two levels of knowledge.
 */
const VARIANT: Record<ProductStatus, "success" | "warning" | "muted"> = {
  draft: "warning",
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
    if (stock.outOfStock) return <Badge variant="warning">Out of stock</Badge>;
    if (stock.low) return <Badge variant="warning">Low stock</Badge>;
  }
  return <Badge variant={VARIANT[status]}>{status}</Badge>;
}
