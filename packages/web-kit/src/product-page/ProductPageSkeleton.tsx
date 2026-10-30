import type { LucideIcon } from "lucide-react";

import type { HeaderBack } from "../console/StaffHeader";
import { RecordPageSkeleton } from "../patterns";

/** The product page while it reads: the record page's skeleton with the product's labels. */
export function ProductPageSkeleton({
  fixedRail = false,
  ...props
}: {
  back: HeaderBack;
  fixedRail?: boolean;
  facts: readonly string[];
  sections: readonly { id: string; icon: LucideIcon; title: string }[];
  rail: readonly string[];
}) {
  return (
    <RecordPageSkeleton
      label="Loading product"
      railTitle={fixedRail ? "Decision" : "About this product"}
      fixedRail={fixedRail}
      {...props}
    />
  );
}
