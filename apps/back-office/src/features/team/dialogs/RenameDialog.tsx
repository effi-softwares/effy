import { useState } from "react"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { TEAM_CONFIRM_WORDS, TEAM_NAME_MAX, type TeamChangeDTO } from "@effy/shared-types"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from "@effy/design-system/ui"

import { track } from "@/lib/telemetry"

import { teamErrorText } from "../changes"
import { meQuery, TEAM_ROOT } from "../queries"

/**
 * Rename (119 US8): a person's name, from their page (an Administrator) or from Your back-office record (themselves).
 * Nobody changes an email (FR-003).
 */
export function RenameDialog({
  current,
  run,
  label = "Edit",
}: {
  current: string | null
  run: (name: string) => Promise<TeamChangeDTO>
  label?: string
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(current ?? "")
  const rename = useMutation({
    mutationFn: run,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEAM_ROOT })
      void queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
      track({ name: "team_member_changed", action: "rename" })
      setOpen(false)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setName(current ?? "")
          rename.reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change name</DialogTitle>
          <DialogDescription>{TEAM_CONFIRM_WORDS.emailChange}</DialogDescription>
        </DialogHeader>
        <form
          id="rename"
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) rename.mutate(name.trim())
          }}
        >
          <Label htmlFor="rename-name">Full name</Label>
          <Input id="rename-name" maxLength={TEAM_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
          {rename.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {teamErrorText(rename.error)}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="rename" disabled={!name.trim() || name.trim() === current || rename.isPending}>
            {rename.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
