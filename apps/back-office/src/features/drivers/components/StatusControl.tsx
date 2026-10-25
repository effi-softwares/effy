import { useState } from "react"

import type { AdminDriverProfile, DriverEmploymentStatus } from "@effy/shared-types"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "@effy/design-system/ui"

import { track } from "@/lib/telemetry"

import { driverActionError } from "../errorText"
import { STATUS_MEANING } from "../model"
import { useSetDriverStatus } from "../queries"

const TRANSITIONS: Record<DriverEmploymentStatus, DriverEmploymentStatus[]> = {
  active: ["suspended", "offboarded"],
  suspended: ["active", "offboarded"],
  offboarded: [],
}

const VERB: Record<DriverEmploymentStatus, string> = {
  active: "Restore",
  suspended: "Suspend",
  offboarded: "Offboard",
}

export function StatusControl({ driver }: { driver: AdminDriverProfile }) {
  const [target, setTarget] = useState<DriverEmploymentStatus | null>(null)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  const mutate = useSetDriverStatus(driver.id)
  const options = TRANSITIONS[driver.status]

  function close() {
    setTarget(null)
    setReason("")
    setError(null)
  }

  function submit() {
    if (!target) return
    setError(null)
    mutate.mutate(
      { status: target, reason },
      {
        onSuccess: () => {
          track({ name: "driver_status_changed", driverId: driver.id, status: target })
          close()
        },
        onError: (e) => {
          setError(driverActionError(e, "status"))
        },
      },
    )
  }

  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This driver has left. Their record and work history are kept for audit; their sign-in is permanently closed.
      </p>
    )
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {options.map((s) => (
          <Button key={s} variant="outline" onClick={() => setTarget(s)}>
            {VERB[s]}…
          </Button>
        ))}
      </div>

      <Dialog open={target !== null} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target ? VERB[target] : ""} {driver.name}
            </DialogTitle>
            <DialogDescription>{target ? STATUS_MEANING[target] : ""}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {target !== "active" ? (
              <div className="border-l-2 border-foreground py-1 pl-3 text-sm">
                <p className="font-medium">They lose access straight away.</p>
                <p className="text-muted-foreground">
                  Work they have not started yet goes back to the pool on the next assignment round. Anything they have
                  already picked up stays with them until someone releases it — you will find it under Stranded work.
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="status-reason">Reason</Label>
              <Textarea
                id="status-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  target === "active"
                    ? "e.g. returned from leave"
                    : target === "suspended"
                      ? "e.g. on leave until 15 September"
                      : "e.g. resigned, last day 29 August"
                }
                rows={2}
              />
              <p className="text-xs text-muted-foreground">Kept on the driver's record and in the change history.</p>
            </div>

            {error ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="button" disabled={mutate.isPending || reason.trim() === ""} onClick={() => submit()}>
              {mutate.isPending ? "Working…" : target ? VERB[target] : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
