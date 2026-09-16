import { Badge } from "@effy/design-system/ui";

import { STATUS_LABEL, type FulfillmentStatus } from "../model";

// Renders a portion's fulfillment state as a semantically-colored Badge (design-system variants),
// using the same `Record<Status, variant>` lookup the catalog's ProductStatusBadge established.
//
// The tones encode OPERATOR URGENCY, not the enum's order: work that needs a human (`pending`,
// `picking`) reads as warning; work that is done for this shop reads as success; states that need
// nothing from the operator right now read as muted.
// ⚠ ALIGNED WITH `OrderPill`'s STATUS_TONE, WHICH IT PREVIOUSLY CONTRADICTED. Both render the same
// enum; before this pass `received` and `picking` were muted/warning here and warn/warn there, and
// `ready_for_pickup` was success here and info there. Two components disagreeing about one fact is
// this repository's most-repeated defect shape, and on a status colour it is worse than useless — the
// operator learns a mapping on one screen and it is wrong on the next.
//
// ⚠ `unfulfillable` and `withdrawn` STAY MUTED, deliberately, and that is the one place this map and
// the adopted design part company. The design would tone a failed state destructive; 055 recorded
// that these need nothing further FROM THIS SHOP — the decision has moved to Effy — and a red chip
// would keep pulling the eye to work the operator cannot action. Recorded rather than silently
// "corrected", because it is a product judgement, not a styling one.
const VARIANT: Record<FulfillmentStatus, "brand" | "success" | "warning" | "muted"> = {
  pending: "warning",
  received: "brand",
  picking: "brand",
  ready_for_pickup: "success",
  collected: "success",
  delivered: "success",
  unfulfillable: "muted",
  withdrawn: "muted",
};

export function FulfillmentStatusBadge({ status }: { status: FulfillmentStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
