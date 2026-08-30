import { useQuery } from "@tanstack/react-query";

import { formatDateTime } from "../model";
import { driverAuditQuery } from "../queries";

/**
 * The driver's change history (FR-025).
 *
 * ⚠ THIS CLOSES A DEFECT RATHER THAN ADDING A FEATURE. Driver management was the only privileged
 * back-office domain writing NO audit row at all — shops, promotions and catalog schema all do.
 * Standing someone down is a decision about a person's employment; "who did this, and when" should
 * never have been unanswerable.
 *
 * ⚠ Readable by every role including csa. Accountability is not an admin-only privilege — a CSA
 * asked "who suspended this driver" should be able to answer it.
 */

const ACTION_LABEL: Record<string, string> = {
  "driver.created": "Added to the platform",
  "driver.updated": "Profile edited",
  "driver.status_changed": "Employment status changed",
  "driver.duty_session_ended": "Duty session ended by back-office",
  "driver.work_released": "Stranded work released",
  "driver.exception_resolved": "Report resolved",
  "driver.proof.viewed": "Proof of delivery opened",
};

interface Detail {
  changed?: string[];
  values?: Record<string, unknown>;
}

function describe(action: string, detail: Detail): string | null {
  if (action === "driver.status_changed") {
    const v = detail.values ?? {};
    const status = typeof v.status === "string" ? v.status : null;
    const reason = typeof v.reason === "string" ? v.reason : null;
    return [status ? `now ${status}` : null, reason].filter(Boolean).join(" — ") || null;
  }
  if (action === "driver.updated" || action === "driver.created") {
    // ⚠ FIELD NAMES ONLY, never values. The audit payload deliberately omits the value of every PII
    // field (FR-050), so rendering values here would show some fields' contents and silently omit
    // others — which reads as data loss rather than as a privacy rule.
    const changed = detail.changed ?? [];
    return changed.length > 0 ? `changed: ${changed.join(", ")}` : null;
  }
  return null;
}

export function AuditTrail({ driverId }: { driverId: string }) {
  const { data, isPending } = useQuery(driverAuditQuery(driverId));

  if (isPending) return <p className="text-sm text-muted-foreground">Loading history…</p>;

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing has changed on this driver since the change history began.
      </p>
    );
  }

  return (
    <ul className="divide-y border-y">
      {items.map((entry) => {
        const detail = (entry.detail ?? {}) as Detail;
        const extra = describe(entry.action, detail);
        return (
          <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
            <span className="tabular-nums text-muted-foreground">{formatDateTime(entry.at)}</span>
            <span className="font-medium">{ACTION_LABEL[entry.action] ?? entry.action}</span>
            {extra ? <span className="text-muted-foreground">{extra}</span> : null}
            {/* The operator's subject id, not their name — back-office staff names are not carried
                on this payload, and inventing a lookup here would add a read to every audit row. */}
            <span className="font-mono text-xs text-muted-foreground">{entry.actorSub}</span>
          </li>
        );
      })}
    </ul>
  );
}
