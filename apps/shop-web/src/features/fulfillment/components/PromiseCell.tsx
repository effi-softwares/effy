import { AlertTriangle } from "lucide-react";

import { formatTime, type DeliveryPromise } from "../model";

/**
 * The delivery promise on a queue row: the service level the customer bought, and the time by which
 * THIS shop must be ready. Read-only — the promise is owned by 021 (FR-009a) and says nothing about
 * who performs the delivery (FR-002a).
 *
 * ⚠ At-risk escalation happens IN PLACE (FR-001a, SC-018). The queue's order is the server's
 * (promise, then arrival) and is STABLE; an aging row must never jump position, because a row that
 * moves under a hand reaching for it is how the wrong order gets picked. So urgency is expressed
 * purely as PROMINENCE in the cell the operator is already reading.
 */
export function PromiseCell({ promise, atRisk }: { promise: DeliveryPromise; atRisk: boolean }) {
  return (
    <div className="min-w-0">
      <div
        className={
          atRisk
            ? "flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400"
            : "flex items-center gap-1.5 tabular-nums"
        }
      >
        {atRisk ? <AlertTriangle className="size-4 shrink-0" aria-hidden="true" /> : null}
        <span className="tabular-nums">{formatTime(promise.readyBy)}</span>
        {atRisk ? <span className="text-xs font-semibold uppercase">At risk</span> : null}
      </div>
      <div className="text-xs text-muted-foreground">{promise.serviceLevel}</div>
    </div>
  );
}
