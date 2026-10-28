import { useState } from "react"

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui"

import { dispatchActionError, refusalReasons } from "../errorText"
import { useReassignRound } from "../queries"

interface Props {
  roundId: string
  currentDriverName: string
  expectedUpdatedAt: string
  drivers: Array<{ driverId: string; driverName: string }>
}

export function ReassignDialog({ roundId, currentDriverName, expectedUpdatedAt, drivers }: Props) {
  const [open, setOpen] = useState(false)
  const [driverId, setDriverId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [reasons, setReasons] = useState<string[]>([])
  const reassign = useReassignRound(roundId)

  function submit() {
    setError(null)
    setReasons([])
    reassign.mutate(
      { driverId, expectedUpdatedAt },
      {
        onSuccess: () => {
          setOpen(false)
          setDriverId("")
        },
        onError: (err) => {
          setError(dispatchActionError(err, "reassign"))
          setReasons(refusalReasons(err))
        },
      },
    )
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Reassign
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move this round to another driver</DialogTitle>
            <DialogDescription>
              {currentDriverName} holds it now. Anything they have already collected stays with them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reassign-driver">Driver</Label>
            <Select
              value={driverId}
              onValueChange={(next) => {
                setDriverId(next)
              }}
            >
              <SelectTrigger id="reassign-driver" className="w-full">
                <SelectValue placeholder="Choose a driver…" />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((d) => (
                  <SelectItem key={d.driverId} value={d.driverId}>
                    {d.driverName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <div role="alert" className="space-y-1 text-sm">
              <p className="font-medium text-destructive">{error}</p>
              {reasons.length > 0 ? (
                <ul className="list-disc pl-5 text-muted-foreground">
                  {reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={driverId === "" || reassign.isPending}>
              {reassign.isPending ? "Moving…" : "Move the round"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
