import { useState } from "react"

import { useQuery } from "@tanstack/react-query"

import { TEAM_ROLE_WORDS, type BackOfficeRole } from "@effy/shared-types"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@effy/design-system/ui"

import { teamErrorText, useTeamChange } from "../changes"
import { memberQuery } from "../queries"
import { setStatus } from "../repo"
import { RoleChoice } from "./RoleChoice"

/**
 * Re-enable (119 US2): they come back with the role they held; a person who never had one (FR-035) is given one here.
 * Opened from their page, or from Add person's "Re-enable them instead".
 */
export function ReenableDialog({
  memberId,
  open,
  onOpenChange,
}: {
  memberId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const member = useQuery({ ...memberQuery(memberId), enabled: open })
  const [role, setRole] = useState<BackOfficeRole | null>(null)
  const m = member.data
  const change = useTeamChange(memberId, "enable", () =>
    setStatus(memberId, "active", m!.revision, m!.role === null ? (role ?? undefined) : undefined),
  )
  const needsRole = m !== undefined && m.role === null

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (o) {
          setRole(null)
          change.reset()
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Re-enable {m ? (m.name ?? m.email) : "this person"}?</DialogTitle>
          <DialogDescription>
            {m && m.role
              ? `They can sign in again as ${TEAM_ROLE_WORDS[m.role]}.`
              : "They were never given a role. Choose the one they sign in with."}
          </DialogDescription>
        </DialogHeader>
        {needsRole ? <RoleChoice name="reenable-role" value={role} onChange={setRole} /> : null}
        {change.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {teamErrorText(change.error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!m || (needsRole && role === null) || change.isPending}
            onClick={() => change.mutate(undefined, { onSuccess: () => onOpenChange(false) })}
          >
            {change.isPending ? "Re-enabling…" : "Re-enable"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
