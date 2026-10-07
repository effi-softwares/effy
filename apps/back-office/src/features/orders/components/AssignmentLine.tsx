import { formatMoment, type OrderAssignment } from "@effy/shared-types";

/**
 * One line: who has this package for one stage, when, and how they got it (073).
 *
 *   Collect  Ada · opens 1:15 pm · due 2 pm
 *            Auto-assigned — fewest packages today (2)
 *
 *   Deliver  Unassigned — No driver is on duty
 *
 * ⚠ PLAIN WORDS ONLY. The operator's direction was to keep this simple: who, when, and one line on
 * how. Anything the person can do about it sits in `actions` beside it.
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

  return (
    <div className="grid grid-cols-[4.5rem_1fr_auto] items-start gap-x-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0 space-y-0.5">
        {assignment.driver ? (
          <p>
            <span className="font-medium">{assignment.driver.name}</span>
            {when.length > 0 ? <span className="text-muted-foreground"> · {when.join(" · ")}</span> : null}
            {!assignment.movable ? <span className="text-muted-foreground"> · in their van</span> : null}
          </p>
        ) : (
          <p>
            <span className="font-medium text-warning">Unassigned</span>
            {assignment.unassignedReason ? (
              <span className="text-muted-foreground"> — {assignment.unassignedReason}</span>
            ) : null}
          </p>
        )}
        {assignment.how ? <p className="text-muted-foreground">{assignment.how}</p> : null}
      </div>
      <div>{actions}</div>
    </div>
  );
}
