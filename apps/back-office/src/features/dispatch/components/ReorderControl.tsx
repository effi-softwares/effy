import { useState } from "react";

import { Button } from "@effy/design-system/ui";

import { dispatchActionError } from "../errorText";
import { useReorderStops, useUnassignRound } from "../queries";

interface Props {
  roundId: string;
  stopIds: string[];
  expectedUpdatedAt: string;
}

/**
 * Move one stop up or down (FR-031), and take the whole round back (FR-030).
 *
 * ⚠ EVERY STOP, EXACTLY ONCE. The service refuses a partial order, because a round where some stops
 * carry a manual position and some do not would have the shared ordering rule mixing a dispatcher's
 * order with a derived one — two answers to one question. Moving a stop therefore sends the WHOLE
 * sequence, not a delta.
 *
 * ⚠ UNASSIGN RETURNS WORK, IT DOES NOT DELETE IT. Anything the driver has already collected stays
 * attributed to them: the packages are physically in a van and no query can know otherwise (056's
 * stranded-work finding).
 */
export function ReorderControl({ roundId, stopIds, expectedUpdatedAt }: Props) {
  const [order, setOrder] = useState<string[]>(stopIds);
  const [error, setError] = useState<string | null>(null);
  const reorder = useReorderStops(roundId);
  const unassign = useUnassignRound(roundId);

  function move(index: number, delta: number) {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
  }

  // ⚠ `mutate` with callbacks — see ReassignDialog.
  function save() {
    setError(null);
    reorder.mutate(
      { stopIds: order, expectedUpdatedAt },
      { onError: (err) => setError(dispatchActionError(err, "reorder")) },
    );
  }

  function takeBack() {
    setError(null);
    unassign.mutate(expectedUpdatedAt, {
      onError: (err) => setError(dispatchActionError(err, "unassign")),
    });
  }

  const dirty = order.join(",") !== stopIds.join(",");

  return (
    <div className="space-y-2">
      <ol className="divide-y divide-border text-sm">
        {order.map((id, i) => (
          <li key={id} className="flex items-center justify-between gap-2 py-2">
            <span className="text-muted-foreground">Stop {i + 1}</span>
            <span className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Move stop ${i + 1} earlier`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Move stop ${i + 1} later`}
                disabled={i === order.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </Button>
            </span>
          </li>
        ))}
      </ol>

      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={!dirty || reorder.isPending}>
          {reorder.isPending ? "Saving…" : "Save this order"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={takeBack}
          disabled={unassign.isPending}
        >
          {unassign.isPending ? "Taking back…" : "Take this round back"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
