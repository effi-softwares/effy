import { Lock } from "lucide-react";

import { formatMoment, type OrderAssignment } from "@effy/shared-types";

import { initialsOf } from "@/components/shell/identity";

/**
 * One row: who has this package for one stage, when, and how they got it.
 *
 *  [SR] Collect · Sam Rivers [Change driver] [Unassign]
 *  Collected 11:42 am · auto-assigned — fewest packages today (2)
 *
 * Plain words; what the person can do sits in `actions`.
 */
export function AssignmentLine({
  label,
  assignment,
  actions,
}: {
  label: "Collect" | "Deliver";
  assignment: OrderAssignment;
  actions?: React.ReactNode;
}) {
  const now = new Date();
  const when = [
    assignment.opensAt ? `opens ${formatMoment(assignment.opensAt, now)}` : null,
    assignment.dueAt ? `due ${formatMoment(assignment.dueAt, now)}` : null,
  ].filter(Boolean);
  const name = assignment.driver?.name;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className={name ? "bo-avatar" : "bo-avatar bo-avatar--blue"} aria-hidden="true">
        {name ? initialsOf(name) : "?"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          <span className="text-muted-foreground">{label}</span> ·{" "}
          {name ? (
            <span className="font-medium">{name}</span>
          ) : (
            <span className="font-medium">Unassigned</span>
          )}
          {name && when.length > 0 ? <span className="text-muted-foreground"> · {when.join(" · ")}</span> : null}
        </div>
        <div className="bo-sub">
          {!name && assignment.unassignedReason ? assignment.unassignedReason : assignment.how}
          {!name && assignment.unassignedReason && assignment.how ? ` · ${assignment.how}` : null}
        </div>
      </div>
      {actions}
      {name && !assignment.movable ? (
        <span className="bo-tag">
          <Lock aria-hidden="true" />
          In their van
        </span>
      ) : null}
    </div>
  );
}
