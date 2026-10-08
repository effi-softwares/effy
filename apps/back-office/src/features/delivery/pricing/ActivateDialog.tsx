import { useState } from "react";

import type { FeePlanDTO } from "@effy/shared-types";
import {
  Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label,
} from "@effy/design-system/ui";

import { useActivatePlan } from "../queries";
import { GapList } from "./GapList";
import { pricingError } from "./gapText";

/**
 * Make a plan the one in force (077). Says which plan it replaces; asks, in words, before a $0
 * minimum goes live; and when refused, shows what is missing rather than "cannot activate".
 */
export function ActivateDialog({ plan, retiring, onClose }: { plan: FeePlanDTO; retiring: FeePlanDTO | null; onClose: () => void }) {
  const activate = useActivatePlan();
  const zeroFloor = plan.gaps.some((g) => g.code === "floor_is_zero");
  const [confirmZero, setConfirmZero] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocking = plan.gaps.filter((g) => g.blocking);

  async function go() {
    setError(null);
    try {
      await activate.mutateAsync({ id: plan.id, confirmZeroFloor: confirmZero });
      onClose();
    } catch (err) {
      setError(pricingError(err));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Activate {plan.name}?</DialogTitle>
          <DialogDescription>
            {retiring
              ? `It replaces ${retiring.name} for every new checkout at once. Orders already placed keep the fee they were sold.`
              : "It becomes the plan every new checkout is priced from. Orders already placed keep the fee they were sold."}
          </DialogDescription>
        </DialogHeader>
        {blocking.length > 0 ? <GapList gaps={plan.gaps} /> : null}
        {zeroFloor ? (
          <div className="flex items-start gap-2">
            <Checkbox id="confirm-zero" checked={confirmZero} onCheckedChange={(v) => setConfirmZero(v === true)} />
            <Label htmlFor="confirm-zero" className="font-normal leading-snug">
              The minimum fee is $0.00. I understand delivery can then be free without the free-delivery amount.
            </Label>
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void go()} disabled={activate.isPending || blocking.length > 0 || (zeroFloor && !confirmZero)}>
            Activate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
