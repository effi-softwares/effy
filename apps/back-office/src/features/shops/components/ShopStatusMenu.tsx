import { useState } from "react";

import type { ShopLifecycleStatus } from "@effy/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@effy/design-system/ui";

import { track } from "@/lib/telemetry";

import { useChangeShopStatus } from "../queries";

// Lifecycle transitions (POST /admin/v1/shops/{id}/status), each confirmed in a dialog that says what
// happens (redesign, board "Suspend a shop"). Emits shop_status_changed.

const VERB: Record<ShopLifecycleStatus, string> = { active: "Activate", suspended: "Suspend", disabled: "Disable" };

const CONSEQUENCES: Record<ShopLifecycleStatus, string[]> = {
  active: ["New orders can be sent here again.", "Operators can sign in and take work."],
  suspended: [
    "Packages already packed or being picked still go out on today's runs.",
    "New orders stop being sent here. Its products stay listed if another shop stocks them.",
    "Operators keep their sign-in and can finish what they have.",
  ],
  disabled: [
    "Every operator's sign-in stops straight away.",
    "No work reaches the shop. Its history is kept.",
  ],
};

export function ShopStatusDialog({
  shopId,
  shopName,
  target,
  onOpenChange,
}: {
  shopId: string;
  shopName: string;
  target: ShopLifecycleStatus | null;
  onOpenChange: (open: boolean) => void;
}) {
  const changeStatus = useChangeShopStatus(shopId);
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    if (!target) return;
    setError(null);
    changeStatus.mutate(
      { status: target },
      {
        onSuccess: () => {
          track({ name: "shop_status_changed", shopId });
          onOpenChange(false);
        },
        onError: () => setError("Couldn't change the shop's status. Try again."),
      },
    );
  }

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {target ? VERB[target] : ""} {shopName}?
          </DialogTitle>
          <DialogDescription>
            {target === "suspended"
              ? "A suspended shop takes no new work. You can activate it again at any time."
              : target === "disabled"
                ? "A disabled shop is closed to its operators. You can activate it again later."
                : "The shop goes back to taking work."}
          </DialogDescription>
        </DialogHeader>
        {target ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">What happens</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {CONSEQUENCES[target].map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={changeStatus.isPending} onClick={confirm}>
            {changeStatus.isPending ? "Working…" : `${target ? VERB[target] : ""} shop`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
