import { CheckCircle2, RefreshCw, RotateCcw, ShoppingBasket } from "lucide-react";
import { useState } from "react";

import { Button, Input, Label } from "@effy/design-system/ui";

import { fulfillmentMutationError, isConflict } from "../errorText";
import {
  canDeclareUnfulfillable,
  nextTransition,
  type FulfillmentDetail,
  type RequestableTransition,
} from "../model";
import { useTransitionFulfillment } from "../queries";

const ACTION_LABEL: Record<RequestableTransition, string> = {
  picking: "Start picking",
  ready_for_pickup: "Mark ready for pickup",
  // ⚠ 055 US6 — plain words, not "unfulfillable". The wire value is not operator copy.
  unfulfillable: "Can't supply this",
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
        {detail.status === "unfulfillable" ? (
          // ⚠ It says what happens NEXT, because the shop has done all they can and the customer is
          // still out of pocket. "Marked as unsuppliable" alone would leave them wondering whether
          // anyone is dealing with it.
          <span className="text-sm text-muted-foreground">
            Effy has been told and will refund the customer.
          </span>
        ) : null}
        {detail.status === "withdrawn" ? (
          // ⚠ NOT the shop's doing, and the wording says so — this screen is where they are judged.
          <span className="text-sm text-muted-foreground">
            The customer cancelled this order. Nothing more to do.
          </span>
        ) : null}
      </div>

      {/* ⚠ 055 US6 — THE EXIT A SHOP HOLDING AN UNFILLABLE ORDER PREVIOUSLY LACKED. Before it the
          portion sat in the queue forever and the only way out was to stop looking at it.

          ⚠ It is SEPARATED from the forward actions and never a primary button: it is the last
          resort, and a mis-tap here tells Effy to refund a customer. */}
      {canDeclareUnfulfillable(detail.status) ? (
        <UnfulfillableControl
          pending={transition.isPending}
          onDeclare={(reason) => transition.mutate({ to: "unfulfillable", reason })}
        />
      ) : null}

      {transition.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span className={conflict ? "font-medium text-foreground" : "text-destructive"}>
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

/**
 * Declaring a portion unsuppliable (055 US6, FR-031).
 *
 * ⚠ IT ASKS BEFORE IT ACTS, and the confirmation names the consequence rather than asking "are you
 * sure?". This tells Effy to refund a customer and takes the order off the shop's queue for good —
 * a mis-tap is not a wrong pixel.
 *
 * ⚠ A REASON IS REQUIRED, here and in the database. Back-office is asked to decide a refund on the
 * strength of this; "the shop said no" is not a basis for returning a customer's money.
 */
function UnfulfillableControl({
  pending,
  onDeclare,
}: {
  pending: boolean;
  onDeclare: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(true)}>
        Can&apos;t supply this order
      </Button>
    );
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <Label htmlFor="unfulfillable-reason">Why can&apos;t you supply this?</Label>
      <Input
        id="unfulfillable-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. the chiller failed overnight"
      />
      <p className="text-sm text-muted-foreground">
        This takes the order off your queue and asks Effy to refund the customer. It can&apos;t be
        undone.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={reason.trim() === "" || pending}
          onClick={() => onDeclare(reason.trim())}
        >
          Can&apos;t supply it
        </Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
