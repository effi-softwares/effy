import type { ProductStatus, ProductStockDTO } from "@effy/shared-types";
import { Archive, ArrowDown, CircleCheck, CircleSlash, PackageX, Pencil, type LucideIcon } from "lucide-react";

import { cn } from "@effy/design-system";

/**
 * A product's state as one status word with its icon: Live green (on sale is done) · Draft outline
 * (waiting on the shop) · Unavailable and Archived grey (inert). An empty shelf is the problem tone —
 * black with its icon, never red; a thin one is outline. Stock overrides the lifecycle word only for a
 * live product (an `active` product with an empty shelf is unbuyable); `stock` is optional, so a
 * surface without it (the catalog table) shows the lifecycle word.
 */
export const PRODUCT_STATUS_WORD: Record<ProductStatus, string> = {
  active: "Live",
  draft: "Draft",
  unavailable: "Unavailable",
  archived: "Archived",
};

const LOOK: Record<ProductStatus, { tone: string; icon: LucideIcon }> = {
  active: { tone: "bo-st--done", icon: CircleCheck },
  draft: { tone: "bo-st--waiting", icon: Pencil },
  unavailable: { tone: "bo-st--quiet", icon: CircleSlash },
  archived: { tone: "bo-st--quiet", icon: Archive },
};

function Word({ tone, icon: Icon, children }: { tone: string; icon: LucideIcon; children: string }) {
  return (
    <span className={cn("bo-st", tone)}>
      <Icon aria-hidden="true" />
      {children}
    </span>
  );
}

export function ProductStatusBadge({
  status,
  stock,
}: {
  status: ProductStatus;
  /** Omit where the count is unknown. Never pass a guess — that is what the lifecycle word is for. */
  stock?: ProductStockDTO;
}) {
  // Only an `active` product's stock changes the answer. An archived product with an empty shelf is
  // archived — saying "Out of stock" would imply restocking it would put it back on sale.
  if (status === "active" && stock?.tracked) {
    // Empty and low must not look alike: one cannot be sold at all, the other still can.
    if (stock.outOfStock) return <Word tone="bo-st--problem" icon={PackageX}>Out of stock</Word>;
    if (stock.low) return <Word tone="bo-st--waiting" icon={ArrowDown}>Low stock</Word>;
  }
  const look = LOOK[status];
  return (
    <Word tone={look.tone} icon={look.icon}>
      {PRODUCT_STATUS_WORD[status]}
    </Word>
  );
}
