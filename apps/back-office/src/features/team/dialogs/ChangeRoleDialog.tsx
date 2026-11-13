import { useState } from "react"

import { isLoweringRole, TEAM_CONFIRM_WORDS, type BackOfficeRole, type TeamMemberDetailDTO } from "@effy/shared-types"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@effy/design-system/ui"

import { teamErrorText, useTeamChange } from "../changes"
import { changeRole } from "../repo"
import { RoleChoice } from "./RoleChoice"

/** Change role (119 US3): one role, in force on their next action; lowering signs them out everywhere. */
export function ChangeRoleDialog({ member }: { member: TeamMemberDetailDTO }) {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<BackOfficeRole | null>(member.role)
  const change = useTeamChange(member.id, "role", (r: BackOfficeRole) => changeRole(member.id, r, member.revision))
  const lowering = role !== null && isLoweringRole(member.role, role)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setRole(member.role)
          change.reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" data-tour="person.role">
          Change role
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>It takes effect on their next action.</DialogDescription>
        </DialogHeader>
        <RoleChoice name="change-role" value={role} onChange={setRole} />
        {lowering ? <p className="text-sm">{TEAM_CONFIRM_WORDS.lowering}</p> : null}
        {change.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {teamErrorText(change.error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={role === null || role === member.role || change.isPending}
            onClick={() => change.mutate(role!, { onSuccess: () => setOpen(false) })}
          >
            {change.isPending ? "Saving…" : "Change role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
