import { useState } from "react";

import { Button } from "@effy/design-system/ui";

import { dispatchActionError } from "../errorText";
import { useLockRound, useUnlockRound } from "../queries";

interface Props {
  roundId: string;
  lockedBy: string | null;
  expectedUpdatedAt: string;
}

/**
 * Mark an assignment as a person's decision, or release it (FR-032).
 *
 * ⚠ A LOCK IS WHAT STOPS THE ENGINE UNDOING A HUMAN JUDGEMENT. The planner runs every few minutes and
 * will happily add work to a round or move it; a dispatcher who knows something the engine cannot —
 * that a driver is finishing early, that a shop asked for one van — needs that decision to survive
 * the next pass. It is the whole of manage-by-exception (D15).
 */
export function LockControl({ roundId, lockedBy, expectedUpdatedAt }: Props) {
  const [error, setError] = useState<string | null>(null);
  const lock = useLockRound(roundId);
  const unlock = useUnlockRound(roundId);
  const busy = lock.isPending || unlock.isPending;

  // ⚠ `mutate` with callbacks — see ReassignDialog: a rejected `mutateAsync` surfaces as an
  // unhandled rejection even when caught.
  function toggle() {
    setError(null);
    const onError = (err: unknown) => setError(dispatchActionError(err, lockedBy ? "unlock" : "lock"));
    if (lockedBy) unlock.mutate(expectedUpdatedAt, { onError });
    else lock.mutate(expectedUpdatedAt, { onError });
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" size="sm" onClick={toggle} disabled={busy}>
        {lockedBy ? "Release the lock" : "Lock this assignment"}
      </Button>
      {lockedBy ? (
        <p className="text-sm text-muted-foreground">
          The planner will leave this round exactly as it stands.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
