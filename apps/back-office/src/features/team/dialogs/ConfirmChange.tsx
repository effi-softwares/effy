import { useState, type ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from "@effy/design-system/ui"
import type { TeamChangeDTO } from "@effy/shared-types"

import { teamErrorText, useTeamChange } from "../changes"

/** A confirmed change with no choices (Disable, Remove, Sign out everywhere): the spec's sentence, then the change. */
export function ConfirmChange({
  memberId,
  action,
  trigger,
  tour,
  title,
  sentence,
  confirm,
  destructive = false,
  run,
}: {
  memberId: string
  action: string
  trigger: string
  tour?: string
  title: string
  sentence: ReactNode
  confirm: string
  destructive?: boolean
  run: () => Promise<TeamChangeDTO>
}) {
  const [open, setOpen] = useState(false)
  const change = useTeamChange(memberId, action, run)
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) change.reset()
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant={destructive ? "destructive" : "outline"} data-tour={tour}>
          {trigger}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{sentence}</AlertDialogDescription>
        </AlertDialogHeader>
        {change.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {teamErrorText(change.error)}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={change.isPending}
            onClick={(e) => {
              e.preventDefault()
              change.mutate(undefined, { onSuccess: () => setOpen(false) })
            }}
          >
            {change.isPending ? "Working…" : confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
