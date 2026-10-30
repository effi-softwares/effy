import { Lock, User } from "lucide-react"

import { Badge } from "@effy/design-system/ui"
import { formatMoment, type OrderAssignment } from "@effy/shared-types"

import { initialsOf } from "@/components/shell/identity"

/**
 * Who collects or delivers a package: the driver (or that nobody has it yet, and why), when the work opens or is
 * due, and the actions on it. One box per step, side by side under the package's bags.
 */
export function AssignmentLine({
  label,
  assignment,
  actions,
}: {
  label: "Collect" | "Deliver"
  assignment: OrderAssignment
  actions?: React.ReactNode
}) {
  const now = new Date()
  const when = [
    assignment.opensAt ? `opens ${formatMoment(assignment.opensAt, now)}` : null,
    assignment.dueAt ? `due ${formatMoment(assignment.dueAt, now)}` : null,
  ].filter(Boolean)
  const name = assignment.driver?.name
  const note = !name && assignment.unassignedReason ? assignment.unassignedReason : assignment.how

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
      <span
        aria-hidden="true"
        className="grid size-8 flex-none place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground [&_svg]:size-4"
      >
        {name ? initialsOf(name) : <User />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-muted-foreground">
          {label === "Collect" ? "Collects" : "Delivers"}
          {when.length > 0 ? ` · ${when.join(" · ")}` : ""}
        </div>
        <div className={`truncate text-[13.5px] ${name ? "font-medium" : "text-muted-foreground"}`}>
          {name ?? "Not assigned yet"}
        </div>
        {note ? (
          <div className="truncate text-xs text-muted-foreground" title={note}>
            {note}
          </div>
        ) : null}
      </div>
      {actions}
      {name && !assignment.movable ? (
        <Badge variant="outline">
          <Lock aria-hidden="true" />
          In their van
        </Badge>
      ) : null}
    </div>
  )
}
