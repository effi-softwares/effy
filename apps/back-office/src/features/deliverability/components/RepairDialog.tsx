import { useState } from "react"

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
  Input,
} from "@effy/design-system/ui"

import { deliverabilityError } from "../errorText"
import type { EmailDeliveryState } from "../model"
import { useRepairDeliverability } from "../queries"

export function RepairDialog({ address, state }: { address: string; state: EmailDeliveryState }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const repair = useRepairDeliverability(address)

  async function confirm() {
    try {
      await repair.mutateAsync(note)
      setOpen(false)
      setNote("")
    } catch {
      // Rendered below from `repair.error`.
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Mark as repaired…</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Re-enable email to this address?</AlertDialogTitle>
          <AlertDialogDescription>
            This clears both the mail service&apos;s block and Effy&apos;s own record for{" "}
            <span className="font-mono">{address}</span>.
            {state === "undeliverable" && (
              <>
                {" "}
                Messages to it were being <strong>permanently rejected</strong>. Only do this once you know the mailbox
                works again - another failure spends Effy&apos;s sending reputation, which every audience&apos;s sign-in
                depends on.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <label htmlFor="repair-note" className="text-sm font-medium">
            What did you check? (required)
          </label>
          <Input
            id="repair-note"
            value={note}
            maxLength={500}
            placeholder="e.g. spoke to Sam; their mailbox was restored today"
            onChange={(e) => setNote(e.target.value)}
          />
          {repair.isError && <p className="text-sm text-destructive">{deliverabilityError(repair.error)}</p>}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!note.trim() || repair.isPending}
            onClick={(e) => {
              e.preventDefault()
              void confirm()
            }}
          >
            {repair.isPending ? "Repairing…" : "Repair"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
