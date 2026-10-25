import { useState } from "react"

import type { SchemaStatus } from "@effy/shared-types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@effy/design-system/ui"

import { catalogMutationError } from "../errorText"

interface RetireControlProps {
  status: SchemaStatus
  entityLabel: string
  mutate: (body: { status: SchemaStatus }) => Promise<unknown>
  pending: boolean
}

export function RetireControl({ status, entityLabel, mutate, pending }: RetireControlProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function activate() {
    setError(null)
    try {
      await mutate({ status: "active" })
    } catch {}
  }

  async function confirmRetire() {
    setError(null)
    try {
      await mutate({ status: "retired" })
      setOpen(false)
    } catch (err) {
      setError(catalogMutationError(err, `This ${entityLabel} is in use and can't be retired.`))
    }
  }

  if (status === "retired") {
    return (
      <Button variant="outline" size="sm" disabled={pending} onClick={activate}>
        Activate
      </Button>
    )
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => setOpen(true)}>
        Retire
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire this {entityLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Retired {entityLabel}s stay on existing products but are hidden from new ones. You can activate it again
              later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmRetire()
              }}
              disabled={pending}
            >
              {pending ? "Retiring…" : "Retire"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
