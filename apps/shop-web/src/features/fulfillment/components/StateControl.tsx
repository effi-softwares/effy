import { CheckCircle2, Loader2, RotateCcw, ShoppingBasket } from "lucide-react";
import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import {
  Button,
  Input,
  Label,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  toast,
} from "@effy/design-system/ui";

import { track } from "@/lib/telemetry";

import { fulfillmentMutationError } from "../errorText";
import {
  canDeclareUnfulfillable,
  nextTransition,
  type FulfillmentStatus,
  type RequestableTransition,
} from "../model";
import { invalidateOrders, useTransitionFulfillment } from "../queries";
import { transitionFulfillment } from "../repo";

const ACTION_LABEL: Record<Exclude<RequestableTransition, "unfulfillable">, string> = {
  picking: "Start picking",
  ready_for_pickup: "Mark ready for pickup",
};

/**
 * The lifecycle actions in the order header (US3, moved into the header by 057 A3):
 * received → picking → ready_for_pickup, plus the ONE permitted reversal (FR-011d).
 *
 * Two rules are structural rather than left to operator discipline:
 *
 *  1. **Exactly one forward action is ever offered**, derived from the state the server just told us
 *     (`nextTransition`). A portion already marked ready shows no completing action at all, so a
 *     second operator cannot double-apply one (US3 scenario 2). `collected` is terminal and offers
 *     nothing (FR-011f).
 *
 *  2. **A 409 is a RELOAD, never a retry.** The mutation invalidates on failure, so the screen
 *     re-reads the portion and re-derives this very control from the truth. Nothing is re-submitted.
 */
export function StateActions({ detail }: { detail: { id: string; status: FulfillmentStatus } }) {
  const transition = useTransitionFulfillment(detail.id);
  const advance = nextTransition(detail.status);

  return (
    <>
      {/* The one permitted reversal — only while not collected (FR-011d/FR-011e). */}
      {detail.status === "ready_for_pickup" ? (
        <Button
          variant="outline"
          size="sm"
          disabled={transition.isPending}
          onClick={() => transition.mutate({ to: "picking", from: detail.status })}
        >
          <RotateCcw />
          Reopen picking
        </Button>
      ) : null}

      {advance && advance !== "unfulfillable" ? (
        <Button
          size="sm"
          disabled={transition.isPending}
          onClick={() => transition.mutate({ to: advance, from: detail.status })}
        >
          {transition.isPending ? (
            <Loader2 className="animate-spin" />
          ) : advance === "picking" ? (
            <ShoppingBasket />
          ) : (
            <CheckCircle2 />
          )}
          {ACTION_LABEL[advance]}
        </Button>
      ) : null}
    </>
  );
}

/** Where the portion stands, in one sentence, for the states that offer no action. */
export function stateNote(status: FulfillmentStatus): string | null {
  switch (status) {
    case "pending":
      return "Acknowledging this order…";
    case "ready_for_pickup":
      return "Awaiting collection — ready, but not yet gone.";
    case "collected":
      return "Collected — this order has left the shop and can no longer be changed.";
    case "delivered":
      return "Delivered to the customer.";
    case "unfulfillable":
      // ⚠ It says what happens NEXT, because the shop has done all they can and the customer is
      // still out of pocket. "Marked as unsuppliable" alone would leave them wondering whether anyone
      // is dealing with it.
      return "Effy has been told and will refund the customer.";
    case "withdrawn":
      // ⚠ NOT the shop's doing, and the wording says so — this screen is where they are judged.
      return "The customer cancelled this order. Nothing more to do.";
    default:
      return null;
  }
}

export interface CantSupplyTarget {
  id: string;
  orderNumber: string;
  status: FulfillmentStatus;
}

/**
 * Declaring orders unsuppliable (055 US6, FR-031) — the console's "Cancel order", for one order from
 * the header or for a selection from the bulk bar.
 *
 * ⚠ IT IS NOT A CANCELLATION, AND IT DOES NOT SAY IT IS. A shop cannot cancel a customer's order — a
 * two-shop order is one purchase, and the other shop's half is still being packed. What a shop CAN say
 * is "we cannot supply our part", and Effy decides the refund. The dialog names that consequence
 * instead of asking "are you sure?".
 *
 * ⚠ A REASON IS REQUIRED, here and in the database. Back-office is asked to decide a refund on the
 * strength of this; "the shop said no" is not a basis for returning a customer's money.
 *
 * ⚠ IN BULK IT NAMES EVERY ORDER IT WILL TOUCH. bulk.ts records why a one-click, unread bulk
 * declaration is dangerous ("how a mis-click refunds five people"); 057 A3 asked for bulk cancel, so
 * the confirmation lists each order number and the reason applies to all of them — the operator reads
 * what they are declaring before they declare it. Orders past the point of no return are left out and
 * said to be left out.
 *
 * ⚠ IT RUNS SEQUENTIALLY AND A FAILURE DOES NOT ABORT THE RUN — the bulk bar's own rule.
 */
export function CantSupplyDialog({
  targets,
  open,
  onOpenChange,
  onDone,
}: {
  targets: readonly CantSupplyTarget[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [running, setRunning] = useState(false);

  const eligible = targets.filter((t) => canDeclareUnfulfillable(t.status));
  const excluded = targets.length - eligible.length;
  const single = targets.length === 1;

  async function run() {
    setRunning(true);
    const failed: string[] = [];
    for (const t of eligible) {
      try {
        await transitionFulfillment(t.id, { to: "unfulfillable", reason: reason.trim() });
        track({ name: "shop_order_state_changed", fulfillmentId: t.id, from: t.status, to: "unfulfillable" });
      } catch (err) {
        failed.push(`${t.orderNumber} (${fulfillmentMutationError(err)})`);
      }
    }
    invalidateOrders(queryClient);
    setRunning(false);

    const done = eligible.length - failed.length;
    if (done > 0) {
      toast.success(
        done === 1 && single
          ? "Marked can't supply — Effy will refund the customer"
          : `${done} order${done === 1 ? "" : "s"} marked can't supply`,
        { description: single ? targets[0]?.orderNumber : undefined },
      );
    }
    if (failed.length > 0) toast.error(`Refused: ${failed.join(", ")}`);
    if (failed.length === 0) {
      setReason("");
      onOpenChange(false);
      onDone?.();
    }
  }

  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <ResponsiveModalContent className="sm:max-w-lg">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>
            {single ? "Can't supply this order" : `Can't supply ${eligible.length} orders`}
          </ResponsiveModalTitle>
          <ResponsiveModalDescription>
            This takes {single ? "the order" : "each order"} off your queue and asks Effy to refund the
            customer for your items. It can&apos;t be undone.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="space-y-4">
          {!single ? (
            <ul className="text-[13px]">
              {eligible.map((t) => (
                <li key={t.id} className="border-border border-t py-1.5 font-mono">
                  {t.orderNumber}
                </li>
              ))}
            </ul>
          ) : null}
          {excluded > 0 ? (
            <p className="text-muted-foreground text-[13px]">
              {excluded} selected order{excluded === 1 ? " has" : "s have"} already left your hands
              and {excluded === 1 ? "is" : "are"} left out.
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="unfulfillable-reason">Why can&apos;t you supply {single ? "it" : "them"}?</Label>
            <Input
              id="unfulfillable-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. the chiller failed overnight"
            />
          </div>
        </div>

        <ResponsiveModalFooter>
          <Button variant="ghost" disabled={running} onClick={() => onOpenChange(false)}>
            Keep {single ? "order" : "orders"}
          </Button>
          <Button
            variant="destructive"
            disabled={reason.trim() === "" || running || eligible.length === 0}
            onClick={() => void run()}
          >
            {running ? <Loader2 className="animate-spin" /> : null}
            {single ? "Can't supply it" : `Can't supply ${eligible.length}`}
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
