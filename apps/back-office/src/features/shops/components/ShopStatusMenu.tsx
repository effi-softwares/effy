import { ChevronDown } from "lucide-react";

import type { ShopLifecycleStatus } from "@effy/shared-types";
import { SHOP_LIFECYCLE_STATUSES } from "@effy/shared-types";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@effy/design-system/ui";

import { track } from "@/lib/telemetry";

import { useChangeShopStatus } from "../queries";

// Lifecycle transition control (POST /admin/v1/shops/{id}/status). The menu offers only the OTHER
// two statuses — you cannot "transition" to the status you already have. Emits shop_status_changed.
export interface ShopStatusMenuProps {
  shopId: string;
  current: ShopLifecycleStatus;
}

const STATUS_LABELS: Record<ShopLifecycleStatus, string> = {
  active: "Activate",
  suspended: "Suspend",
  disabled: "Disable",
};

export function ShopStatusMenu({ shopId, current }: ShopStatusMenuProps) {
  const changeStatus = useChangeShopStatus(shopId);
  const options = SHOP_LIFECYCLE_STATUSES.filter((s) => s !== current);

  function transition(status: ShopLifecycleStatus) {
    changeStatus.mutate(
      { status },
      { onSuccess: () => track({ name: "shop_status_changed", shopId }) },
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={changeStatus.isPending}>
          Change status
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Set status to</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((status) => (
          <DropdownMenuItem
            key={status}
            variant={status === "disabled" ? "destructive" : "default"}
            onSelect={() => transition(status)}
          >
            {STATUS_LABELS[status]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
