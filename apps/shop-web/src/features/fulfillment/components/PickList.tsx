import { ImageOff, Minus, PackageX, Plus, Undo2 } from "lucide-react";

import { Button } from "@effy/design-system/ui";

import { fulfillmentMutationError } from "../errorText";
import { isPickable, remainingQuantity, type FulfillmentItem, type FulfillmentStatus } from "../model";
import { useUpdateItemProgress } from "../queries";

/**
 * The pick list (US2) — the screen a person actually stands in front of, so it is a plain sectioned
 * LIST of rows, never cards (Principle V / DOCTRINE-2): big type, big targets, one line per shelf
 * item, readable at arm's length from a tablet on a bench.
 *
 * Every control writes an ABSOLUTE quantity, never a delta (FR-010a) — so a double-tap on a flaky
 * connection is idempotent rather than double-counted. `gathered + unavailable <= ordered` is
 * enforced server-side and by a DB CHECK; the controls simply refuse to offer an illegal value.
 *
 * Un-flagging is a first-class affordance, not an undo buried in a menu (FR-010d): items turn up.
 * It writes `unavailableQuantity: 0` and leaves `gathered` alone.
 */
export function PickList({
  fulfillmentId,
  items,
  status,
}: {
  fulfillmentId: string;
  items: FulfillmentItem[];
  status: FulfillmentStatus;
}) {
  const progress = useUpdateItemProgress(fulfillmentId);
  const editable = isPickable(status);

  function write(item: FulfillmentItem, body: { gatheredQuantity?: number; unavailableQuantity?: number }) {
    progress.mutate({
      orderItemId: item.orderItemId,
      body,
      label: item.name,
      ordered: item.orderedQuantity,
    });
  }

  return (
    <div className="grid">
      {!editable ? (
        <p className="text-muted-foreground border-border border-b py-3 text-[13px]">
          {status === "received" || status === "pending"
            ? "Start picking to record progress against these lines."
            : status === "ready_for_pickup"
              ? "Ready for pickup — reopen picking to change these lines."
              : "This order has left picking — its pick list is final."}
        </p>
      ) : null}

      {progress.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {fulfillmentMutationError(progress.error)}
        </p>
      ) : null}

      {/* ⚠ 057 A3 — row rules, no outer frame: the section's own hairline is the top edge, as on every
          open section in the console. */}
      <ul className="divide-border divide-y">
        {items.map((item) => {
          const pendingWrite =
            progress.isPending && progress.variables?.orderItemId === item.orderItemId;
          const flagged = item.unavailableQuantity > 0;
          const remaining = remainingQuantity(item);

          return (
            <li
              key={item.orderItemId}
              className="border-border flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap"
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="border-border size-9 shrink-0 rounded-md border object-cover"
                />
              ) : (
                <div className="border-border bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md border">
                  <ImageOff className="size-4" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium break-words">{item.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground font-mono text-[12px]">{item.sku ?? "—"}</span>
                  <span
                    className={
                      flagged
                        ? "text-destructive text-[11.5px] font-medium"
                        : "text-muted-foreground text-[11.5px]"
                    }
                  >
                    {flagged
                      ? `${item.unavailableQuantity} unavailable`
                      : `ordered ${item.orderedQuantity}`}
                  </span>
                </div>
              </div>

              {/* Gathered stepper — absolute values, clamped to what is legal. */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label={`Fewer gathered: ${item.name}`}
                  disabled={!editable || pendingWrite || item.gatheredQuantity <= 0}
                  onClick={() => write(item, { gatheredQuantity: item.gatheredQuantity - 1 })}
                >
                  <Minus />
                </Button>
                <span
                  className="min-w-14 text-center text-[15px] font-semibold tabular-nums"
                  aria-label={`Gathered ${item.gatheredQuantity} of ${item.orderedQuantity}: ${item.name}`}
                >
                  {item.gatheredQuantity}/{item.orderedQuantity}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label={`More gathered: ${item.name}`}
                  disabled={!editable || pendingWrite || remaining <= 0}
                  onClick={() => write(item, { gatheredQuantity: item.gatheredQuantity + 1 })}
                >
                  <Plus />
                </Button>
              </div>

              {/* Shortfall: flag what is not on the shelf, and un-flag it when it turns up. */}
              {flagged ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[12.5px]"
                  disabled={!editable || pendingWrite}
                  onClick={() => write(item, { unavailableQuantity: 0 })}
                >
                  <Undo2 />
                  Found it
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[12.5px]"
                  disabled={!editable || pendingWrite || remaining <= 0}
                  onClick={() => write(item, { unavailableQuantity: remaining })}
                >
                  <PackageX />
                  Unavailable
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
