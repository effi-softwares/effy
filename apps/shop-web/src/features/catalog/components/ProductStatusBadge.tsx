import type { ProductStatus } from "@effy/shared-types";
import { Badge } from "@effy/design-system/ui";

// Renders a product's lifecycle status as a semantically-colored Badge (design-system variants).
// active reads as success; draft/unavailable as warning; archived as muted.
const VARIANT: Record<ProductStatus, "success" | "warning" | "muted"> = {
  draft: "warning",
  active: "success",
  unavailable: "warning",
  archived: "muted",
};

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <Badge variant={VARIANT[status]}>{status}</Badge>;
}
