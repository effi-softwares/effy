import { useState } from "react"

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@effy/design-system/ui"

import { track } from "@/lib/telemetry"

import { driverActionError } from "../errorText"
import { useCreateDriver } from "../queries"

export function CreateDriverDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [workEmail, setWorkEmail] = useState("")
  const [error, setError] = useState<string | null>(null)

  const create = useCreateDriver()

  function reset() {
    setName("")
    setWorkEmail("")
    setError(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <Button onClick={() => setOpen(true)}>Add driver</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a driver</DialogTitle>
          <DialogDescription>
            Creates their record and a sign-in for the driver app. They sign in with this work email and a six-digit
            code — there is no password. Everything else can be filled in afterwards.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            create.mutate(
              {
                name,
                workEmail,
              },
              {
                onSuccess: (driver) => {
                  track({ name: "driver_created", driverId: driver.id })
                  setOpen(false)
                  reset()
                },
                onError: (e) => setError(driverActionError(e, "create")),
              },
            )
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="driver-name">Name</Label>
            <Input
              id="driver-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="driver-email">Work email</Label>
            <Input
              id="driver-email"
              type="email"
              value={workEmail}
              onChange={(e) => setWorkEmail(e.target.value)}
              required
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">This is how they sign in, and it cannot be changed later.</p>
          </div>

          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Adding…" : "Add driver"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
