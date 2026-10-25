import { useState } from "react"

import type { DeliveryExceptionDTO } from "@effy/shared-types"
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

import { exceptionMutationError } from "./errorText"
import { useRecordReturn } from "./queries"

export function RecordReturnButton({ exception }: { exception: DeliveryExceptionDTO }) {
  const [open, setOpen] = useState(false)
  const [changeId, setChangeId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const record = useRecordReturn()

  async function confirm() {
    setError(null)
    try {
      await record.mutateAsync({ roundId: exception.roundId, changeId })
      setOpen(false)
    } catch (err) {
      setError(exceptionMutationError(err))
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setChangeId(crypto.randomUUID())
          setError(null)
          setOpen(true)
        }}
      >
        Record return
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Record the return for {exception.driverName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every parcel from this round&apos;s failed deliveries will be marked back at the hub, and recorded as
              returned by you. Do this only once the parcels are on a hub shelf.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={record.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirm()
              }}
              disabled={record.isPending}
            >
              {record.isPending ? "Recording…" : "Record return"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
