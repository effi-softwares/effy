import { useState } from "react"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { TEAM_EMAIL_SHAPE, TEAM_NAME_MAX, TEAM_REFUSAL_WORDS, type BackOfficeRole } from "@effy/shared-types"
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from "@effy/design-system/ui"

import { track } from "@/lib/telemetry"

import { teamRefusal } from "../access"
import { teamErrorText } from "../changes"
import { TEAM_ROOT } from "../queries"
import { addPerson } from "../repo"
import { RoleChoice } from "./RoleChoice"

/** The id of the person a refusal names (`already_on_team` / `disabled_on_team`). */
function memberIdOf(err: unknown): string | null {
  const fields = (err as { fields?: { field: string; message: string }[] } | null)?.fields
  return fields?.find((f) => f.field === "memberId")?.message ?? null
}

/** Add person (119 US1): work email, full name, one role, and the invitation (ticked). */
export function AddPersonDialog({
  open,
  onOpenChange,
  initialEmail = "",
  onReenable,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialEmail?: string
  /** "Re-enable them instead": opens Re-enable for that person. */
  onReenable: (memberId: string) => void
}) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState(initialEmail)
  const [name, setName] = useState("")
  const [role, setRole] = useState<BackOfficeRole | null>(null)
  const [invite, setInvite] = useState(true)

  const add = useMutation({
    mutationFn: addPerson,
    onSuccess: (out) => {
      void queryClient.invalidateQueries({ queryKey: TEAM_ROOT })
      track({ name: "team_member_added", role: out.member.role ?? "none" })
      if (out.complete) toast.success(`${out.member.name ?? out.member.email} was added.`)
      else toast.error(TEAM_REFUSAL_WORDS.incomplete)
      reset()
      onOpenChange(false)
    },
  })

  function reset() {
    setEmail("")
    setName("")
    setRole(null)
    setInvite(true)
    add.reset()
  }

  const ready = TEAM_EMAIL_SHAPE.test(email.trim()) && name.trim() !== "" && role !== null
  const refusal = add.isError ? teamRefusal(add.error) : null
  const memberId = add.isError ? memberIdOf(add.error) : null

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setEmail(initialEmail)
        else reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
          <DialogDescription>They sign in with this email and a six-digit code. Back-office keeps no passwords.</DialogDescription>
        </DialogHeader>
        <form
          id="add-person"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (ready) add.mutate({ email: email.trim(), name: name.trim(), role: role!, invite })
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="add-email">Work email</Label>
            <Input id="add-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-name">Full name</Label>
            <Input id="add-name" maxLength={TEAM_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Role</legend>
            <RoleChoice name="add-role" value={role} onChange={setRole} />
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={invite} onCheckedChange={(v) => setInvite(v === true)} />
            Email them an invitation
          </label>

          {add.isError ? (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>{teamErrorText(add.error)}</p>
              {refusal === "already_on_team" && memberId ? (
                <Link className="link" to="/settings/team/$staffId" params={{ staffId: memberId }} onClick={() => onOpenChange(false)}>
                  Open them
                </Link>
              ) : null}
              {refusal === "disabled_on_team" && memberId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false)
                    onReenable(memberId)
                  }}
                >
                  Re-enable them instead
                </Button>
              ) : null}
            </div>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-person" disabled={!ready || add.isPending}>
            {add.isPending ? "Adding…" : "Add person"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
