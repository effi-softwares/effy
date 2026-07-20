import { CheckCircle2, RefreshCw, RotateCcw, ShoppingBasket } from "lucide-react";

import { Button } from "@effy/design-system/ui";

import { fulfillmentMutationError, isConflict } from "../errorText";
import { nextTransition, type FulfillmentDetail, type RequestableTransition } from "../model";
import { useTransitionFulfillment } from "../queries";

const ACTION_LABEL: Record<RequestableTransition, string> = {
  picking: "Start picking",
  ready_for_pickup: "Mark ready for pickup",
};

/**
 * The lifecycle control (US3): received → picking → ready_for_pickup, plus the ONE permitted
 * reversal (FR-011d).
 *
 * Two rules are structural rather than left to operator discipline:
 *
 *  1. **Exactly one forward action is ever offered**, derived from the state the server just told us
 *     (`nextTransition`). A portion already marked ready shows no completing action at all, so a
 *     second operator cannot double-apply one (US3 scenario 2). `collected` is terminal and offers
 *     nothing (FR-011f).
 *
 *  2. **A 409 is a RELOAD, never a retry.** 409 means the requested transition is illegal from the
 *     state the server actually holds — someone else moved it. Re-submitting would push a decision
 *     made against a state that no longer exists, so the only affordance offered is "reload", which
 *     re-reads the portion and re-derives the action from the truth.
 */
export function StateControl({
  detail,
  onReload,
}: {
  detail: FulfillmentDetail;
  onReload: () => void;
}) {
  const transition = useTransitionFulfillment(detail.id);
  const advance = nextTransition(detail.status);
  const conflict = isConflict(transition.error);

  function go(to: RequestableTransition) {
    transition.mutate({ to });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {advance ? (
          <Button size="lg" disabled={transition.isPending} onClick={() => go(advance)}>
            {advance === "picking" ? <ShoppingBasket /> : <CheckCircle2 />}
            {ACTION_LABEL[advance]}
          </Button>
        ) : null}

        {/* The one permitted reversal — only while not collected (FR-011d/FR-011e). */}
        {detail.status === "ready_for_pickup" ? (
          <Button
            variant="outline"
            size="lg"
            disabled={transition.isPending}
            onClick={() => go("picking")}
          >
            <RotateCcw />
            Reopen picking
          </Button>
        ) : null}

        {detail.status === "ready_for_pickup" ? (
          <span className="text-sm text-muted-foreground">
            Awaiting collection — ready, but not yet gone.
          </span>
        ) : null}
        {detail.status === "collected" ? (
          <span className="text-sm text-muted-foreground">
            Collected — this order has left the shop and can no longer be changed.
          </span>
        ) : null}
        {detail.status === "pending" ? (
          <span className="text-sm text-muted-foreground">Acknowledging this order…</span>
        ) : null}
      </div>

      {transition.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span className={conflict ? "font-medium text-amber-700 dark:text-amber-400" : "text-destructive"}>
            {fulfillmentMutationError(transition.error)}
          </span>
          {conflict ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                transition.reset();
                onReload();
              }}
            >
              <RefreshCw />
              Reload
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
