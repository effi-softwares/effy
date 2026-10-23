import { Loader2 } from "lucide-react";
import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { Button, toast } from "@effy/design-system/ui";

import { DesignSheet, SheetField } from "@/components/console/DesignSheet";
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
 * The lifecycle actions in the order header: received → picking → ready_for_pickup, plus the one
 * permitted reversal.
 *  1. Exactly one forward action, derived from the server's state (`nextTransition`), so a second
 *  operator cannot double-apply it. `collected` offers nothing.
 *  2. A 409 is a reload, never a retry: the mutation invalidates and this control re-derives.
 */
export function StateActions({ detail }: { detail: { id: string; status: FulfillmentStatus } }) {
  const transition = useTransitionFulfillment(detail.id);
  const advance = nextTransition(detail.status);

  return (
    <>
      {/* The one permitted reversal — only while not collected. */}
      {detail.status === "ready_for_pickup" ? (
        <Button
          variant="outline"
          className="h-8 px-[11px] text-[13px]"
          disabled={transition.isPending}
          onClick={() => transition.mutate({ to: "picking", from: detail.status })}
        >
          Reopen picking
        </Button>
      ) : null}

      {advance && advance !== "unfulfillable" ? (
        <Button
          className="h-8 px-[13px] text-[13px]"
          disabled={transition.isPending}
          onClick={() => transition.mutate({ to: advance, from: detail.status })}
        >
          {transition.isPending ? <Loader2 className="animate-spin" /> : null}
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
      // It says what happens next, because the shop has done all they can and the customer is
      // still out of pocket. "Marked as unsuppliable" alone would leave them wondering whether anyone
      // is dealing with it.
      return "Effy has been told and will refund the customer.";
    case "withdrawn":
      // Not the shop's doing, and the wording says so — this screen is where they are judged.
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

/** The design's cancel-reason picker, in the words a shop floor uses for "we can't supply it". */
const REASONS = [
  "Out of stock",
  "Items damaged or unusable",
  "Shop can't open or trade",
  "Other",
] as const;

/**
 * Declaring orders unsuppliable — the design's "Cancel order" / "Cancel selected
 * orders?" sheet, for one order from the rail or for a selection from the bulk bar.
 *
 * It is not a cancellation, and it does not say it is. A shop cannot cancel a customer's order — a
 * two-shop order is one purchase and the other half is still being packed. What a shop can say is "we
 * cannot supply our part", and Effy decides the refund. So the design's two toggles ("Return items to
 * stock", "Refund the payment") are not offered: both are Effy's decision on the refund that follows.
 *
 * A reason is required, here and in the database — back-office decides a refund on the strength of
 * it. "Other" asks for the words.
 *
 * In bulk it names every order it will touch and leaves out, and says it leaves out, any order
 * already past the point of no return. Sequential; a failure does not abort the run.
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
  const [choice, setChoice] = useState<(typeof REASONS)[number]>("Out of stock");
  const [other, setOther] = useState("");
  const [running, setRunning] = useState(false);

  const eligible = targets.filter((t) => canDeclareUnfulfillable(t.status));
  const excluded = targets.length - eligible.length;
  const single = targets.length === 1;
  const reason = choice === "Other" ? other.trim() : choice;

  async function run() {
    setRunning(true);
    const failed: string[] = [];
    for (const t of eligible) {
      try {
        await transitionFulfillment(t.id, { to: "unfulfillable", reason });
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
        single
          ? "Marked can't supply — Effy will refund the customer"
          : `${done} order${done === 1 ? "" : "s"} marked can't supply`,
        { description: single ? targets[0]?.orderNumber : undefined },
      );
    }
    if (failed.length > 0) toast.error(`Refused: ${failed.join(", ")}`);
    if (failed.length === 0) {
      setChoice("Out of stock");
      setOther("");
      onOpenChange(false);
      onDone?.();
    }
  }

  return (
    <DesignSheet
      open={open}
      onOpenChange={onOpenChange}
      title={single ? "Can't supply this order?" : "Can't supply the selected orders?"}
      description={
        single
          ? "It leaves your queue and Effy refunds the customer for your items. It can't be undone."
          : "Each order leaves your queue and Effy refunds every customer for your items. It can't be undone."
      }
      cancelLabel={single ? "Keep order" : "Keep orders"}
      saveLabel={single ? "Can't supply it" : `Can't supply ${eligible.length}`}
      destructive
      canSave={reason !== "" && eligible.length > 0}
      saving={running}
      onSave={() => void run()}
    >
      {!single ? (
        <div className="grid">
          {eligible.map((t) => (
            <div key={t.id} className="border-border border-b py-2 font-mono text-[12.5px]">
              {t.orderNumber}
            </div>
          ))}
          {excluded > 0 ? (
            <p className="text-muted-foreground pt-2 text-[12.5px]">
              {excluded} selected order{excluded === 1 ? " has" : "s have"} already left your hands and{" "}
              {excluded === 1 ? "is" : "are"} left out.
            </p>
          ) : null}
        </div>
      ) : null}

      <SheetField label="Reason" htmlFor="unfulfillable-reason">
        <select
          id="unfulfillable-reason"
          aria-label="Why can't you supply it?"
          value={choice}
          onChange={(e) => setChoice(e.target.value as (typeof REASONS)[number])}
          className="border-input bg-background focus:border-ring h-9 cursor-pointer rounded-md border px-2.5 text-sm outline-none"
        >
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </SheetField>
      {choice === "Other" ? (
        <SheetField label="Say what happened" htmlFor="unfulfillable-other">
          <input
            id="unfulfillable-other"
            autoFocus
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="e.g. the chiller failed overnight"
            className="border-input bg-background focus:border-ring h-9 rounded-md border px-3 text-sm outline-none"
          />
        </SheetField>
      ) : null}
    </DesignSheet>
  );
}
