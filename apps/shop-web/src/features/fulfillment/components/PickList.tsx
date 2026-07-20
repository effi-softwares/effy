import { ImageOff, Minus, PackageX, Plus, Undo2 } from "lucide-react";

import { Badge, Button } from "@effy/design-system/ui";

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
    progress.mutate({ orderItemId: item.orderItemId, body });
  }

  return (
    <div className="space-y-3">
      {!editable ? (
        <p className="text-sm text-muted-foreground">
          {status === "collected"
            ? "This order has been collected — its pick list is final."
            : "Start picking to record progress against these lines."}
        </p>
      ) : null}

      {progress.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {fulfillmentMutationError(progress.error)}
        </p>
      ) : null}

      <ul className="divide-y rounded-md border">
        {items.map((item) => {
          const pendingWrite =
            progress.isPending && progress.variables?.orderItemId === item.orderItemId;
          const flagged = item.unavailableQuantity > 0;
          const remaining = remainingQuantity(item);

          return (
            <li
              key={item.orderItemId}
              className="flex flex-wrap items-center gap-4 px-4 py-3 sm:flex-nowrap"
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="size-12 shrink-0 rounded-md border object-cover"
                />
              ) : (
                <div className="flex size-12 shrink-0 items-center justify-center rounded-md border text-muted-foreground">
                  <ImageOff className="size-5" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="font-medium break-words">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{item.sku ?? "—"}</span> · ordered{" "}
                  <span className="tabular-nums">{item.orderedQuantity}</span>
                </p>
                {flagged ? (
                  <Badge variant="warning" className="mt-1">
                    {item.unavailableQuantity} unavailable
                  </Badge>
                ) : null}
              </div>

              {/* Gathered stepper — absolute values, clamped to what is legal. */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={`Fewer gathered: ${item.name}`}
                  disabled={!editable || pendingWrite || item.gatheredQuantity <= 0}
                  onClick={() => write(item, { gatheredQuantity: item.gatheredQuantity - 1 })}
                >
                  <Minus />
                </Button>
                <span
                  className="min-w-16 text-center text-lg font-semibold tabular-nums"
                  aria-label={`Gathered ${item.gatheredQuantity} of ${item.orderedQuantity}: ${item.name}`}
                >
                  {item.gatheredQuantity}/{item.orderedQuantity}
                </span>
                <Button
                  variant="outline"
                  size="icon"
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
