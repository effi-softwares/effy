import { Lock } from "lucide-react"

import { Badge } from "@effy/design-system/ui"
import { formatMoment, type OrderAssignment } from "@effy/shared-types"

import { initialsOf } from "@/components/shell/identity"

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

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className={name ? "avatar" : "avatar avatar--blue"} aria-hidden="true">
        {name ? initialsOf(name) : "?"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          <span className="text-muted-foreground">{label}</span> ·{" "}
          {name ? <span className="font-medium">{name}</span> : <span className="font-medium">Unassigned</span>}
          {name && when.length > 0 ? <span className="text-muted-foreground"> · {when.join(" · ")}</span> : null}
        </div>
        <div className="mt-0.5 block text-sm text-muted-foreground">
          {!name && assignment.unassignedReason ? assignment.unassignedReason : assignment.how}
          {!name && assignment.unassignedReason && assignment.how ? ` · ${assignment.how}` : null}
        </div>
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
