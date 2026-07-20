import { Badge } from "@effy/design-system/ui";

import { STATUS_LABEL, type FulfillmentStatus } from "../model";

// Renders a portion's fulfillment state as a semantically-colored Badge (design-system variants),
// using the same `Record<Status, variant>` lookup the catalog's ProductStatusBadge established.
//
// The tones encode OPERATOR URGENCY, not the enum's order: work that needs a human (`pending`,
// `picking`) reads as warning; work that is done for this shop reads as success; states that need
// nothing from the operator right now read as muted.
const VARIANT: Record<FulfillmentStatus, "success" | "warning" | "muted"> = {
  pending: "warning",
  received: "muted",
  picking: "warning",
  ready_for_pickup: "success",
  collected: "muted",
};

export function FulfillmentStatusBadge({ status }: { status: FulfillmentStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
