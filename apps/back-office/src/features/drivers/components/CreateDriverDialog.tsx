import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui";

import { track } from "@/lib/telemetry";

import { driverActionError } from "../errorText";
import { useCreateDriver, zonesQuery } from "../queries";

const NO_ZONE = "none";

/**
 * Provision a driver — the platform record and a driver-app sign-in, created together (FR-013).
 *
 * ⚠ THE REFUSAL IS THE POINT OF THIS COMPONENT, not the happy path. Creating with a work email that
 * already belongs to someone must be REFUSED and must NAME them (FR-014). Before this feature the
 * same action silently adopted that person's record — overwriting their name, zone and vehicle — and
 * re-enabled the sign-in of someone who had been deliberately stood down. It reported success.
 */
export function CreateDriverDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [zoneId, setZoneId] = useState(NO_ZONE);
  const [error, setError] = useState<string | null>(null);

  const zones = useQuery(zonesQuery());
  const create = useCreateDriver();

  function reset() {
    setName("");
    setWorkEmail("");
    setZoneId(NO_ZONE);
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Button onClick={() => setOpen(true)}>Add driver</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a driver</DialogTitle>
          <DialogDescription>
            Creates their record and a sign-in for the driver app. They sign in with this work email
            and a six-digit code — there is no password. Everything else can be filled in afterwards.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate(
              {
                name,
                workEmail,
                zoneId: zoneId === NO_ZONE ? null : zoneId,
              },
              {
                onSuccess: (driver) => {
                  track({ name: "driver_created", driverId: driver.id });
                  setOpen(false);
                  reset();
                },
                onError: (e) => setError(driverActionError(e, "create")),
              },
            );
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
            {/* ⚠ Said up front, because it cannot be undone from this console: the work email is the
                sign-in identity and there is no route that changes it. */}
            <p className="text-xs text-muted-foreground">
              This is how they sign in, and it cannot be changed later.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="driver-zone">Delivery zone</Label>
            <Select value={zoneId} onValueChange={setZoneId}>
              <SelectTrigger id="driver-zone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ZONE}>Not assigned yet</SelectItem>
                {(zones.data ?? []).map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {zoneId === NO_ZONE ? (
              // SC-009 — stated at the moment it becomes true, not discovered later by an order
              // that quietly fails to move.
              <p className="text-xs text-muted-foreground">
                A driver with no zone cannot be given work. You can assign one at any time.
              </p>
            ) : null}
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
  );
}
