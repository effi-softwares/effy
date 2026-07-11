import type { ShopLifecycleStatus, ShopStaffStatus } from "@effy/shared-types";
import { Badge } from "@effy/design-system/ui";

// Renders a shop or staff status as a semantically-colored Badge (design-system variants).
// active reads as success, suspended as warning, disabled as muted.

const SHOP_VARIANT: Record<ShopLifecycleStatus, "success" | "warning" | "muted"> = {
  active: "success",
  suspended: "warning",
  disabled: "muted",
};

const STAFF_VARIANT: Record<ShopStaffStatus, "success" | "muted"> = {
  active: "success",
  disabled: "muted",
};

export function ShopStatusBadge({ status }: { status: ShopLifecycleStatus }) {
  return <Badge variant={SHOP_VARIANT[status]}>{status}</Badge>;
}

export function StaffStatusBadge({ status }: { status: ShopStaffStatus }) {
  return <Badge variant={STAFF_VARIANT[status]}>{status}</Badge>;
}
