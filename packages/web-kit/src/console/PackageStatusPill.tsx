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
 * Where a package is, as one pill on both consoles. The word is the server's (`view.word`, from
 * `STATUS_WORD`); this never maps a status itself. The tone reinforces it; a driver's name follows when
 * the view has one (the shop's never does), and a Problem's reason sits beside it. `icons` puts each
 * status's icon in front.
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
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge variant={STATUS_TONE[view.status]}>
        {icons ? <Icon aria-hidden="true" /> : null}
        {view.word}
      </Badge>
      {view.driverName ? <span className="text-sm text-muted-foreground">{view.driverName}</span> : null}
      {showDetail && view.detail ? <span className="text-sm text-destructive">{view.detail}</span> : null}
    </span>
  );
}
