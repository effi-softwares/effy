import type { LucideIcon } from "lucide-react";
import {
  CircleAlert,
  CircleCheck,
  CircleSlash,
  Forward,
  PackageCheck,
  PackageOpen,
  Route,
  Truck,
  Warehouse,
} from "lucide-react";

import { Badge } from "@effy/design-system/ui";
import { STATUS_TONE, type PackageStatus, type PackageStatusView } from "@effy/shared-types";

/**
 * Where a package is, as one pill — the same on the back-office and the shop console (073).
 *
 * ⚠ THE WORD IS THE SERVER'S (`view.word`, from `STATUS_WORD`). This component never maps a status to
 * a label itself: four separate maps reading the shop's status are how a collected package came to
 * say "At hub" in one console and "Collected" in the other.
 *
 * The tone only reinforces the word (the closed mapping). A driver's name follows when the view
 * carries one — the shop's never does — and a Problem's one-line reason sits beside it.
 *
 * `icons` (back-office redesign, Foundations board) puts each word's icon in front of it — one icon
 * per status, so a problem reads as one at a glance without a colour. Omitted, the pill renders
 * exactly as before, which is what keeps the shop console unchanged.
 */
const STATUS_ICON: Record<PackageStatus, LucideIcon> = {
  preparing: PackageOpen,
  ready: PackageCheck,
  with_driver: Truck,
  at_hub: Warehouse,
  out_for_delivery: Route,
  with_carrier: Forward,
  delivered: CircleCheck,
  problem: CircleAlert,
  cancelled: CircleSlash,
};

export function PackageStatusPill({
  view,
  showDetail = true,
  icons = false,
}: {
  view: PackageStatusView;
  showDetail?: boolean;
  icons?: boolean;
}) {
  const Icon = STATUS_ICON[view.status];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <Badge variant={STATUS_TONE[view.status]}>
        {icons ? <Icon aria-hidden="true" /> : null}
        {view.word}
      </Badge>
      {view.driverName ? <span className="text-sm text-muted-foreground">{view.driverName}</span> : null}
      {showDetail && view.detail ? <span className="text-sm text-destructive">{view.detail}</span> : null}
    </span>
  );
}
