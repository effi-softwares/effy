import { useEffect, useState } from "react";

import { dispatchActionError } from "../errorText";
import { useReorderStops, useUnassignRound } from "../queries";

/**
 * A dispatcher's own order for a round's stops, and taking the round back (063 FR-031).
 *
 * Nothing changes until "Save this order": moving a stop only changes this screen. Both writes carry
 * the round's `updatedAt` as they read it, so a round the driver or another dispatcher changed in the
 * meantime is refused with a sentence, never overwritten.
 */
export function useRoundEditing(roundId: string, stopIds: string[], expectedUpdatedAt: string) {
  const [order, setOrder] = useState<string[]>(stopIds);
  const [error, setError] = useState<string | null>(null);
  const reorder = useReorderStops(roundId);
  const unassign = useUnassignRound(roundId);
  const key = stopIds.join(",");

  // A fresh read (a live update, or after saving) resets the working order to the server's.
  useEffect(() => setOrder(key ? key.split(",") : []), [key]);

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
    reorder.mutate({ stopIds: order, expectedUpdatedAt }, { onError: (err) => setError(dispatchActionError(err, "reorder")) });
  }

  function takeBack() {
    setError(null);
    unassign.mutate(expectedUpdatedAt, { onError: (err) => setError(dispatchActionError(err, "unassign")) });
  }

  return {
    order,
    move,
    save,
    discard: () => setOrder(stopIds),
    takeBack,
    dirty: order.join(",") !== key,
    error,
    saving: reorder.isPending,
    takingBack: unassign.isPending,
  };
}
