import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { Button, Label } from "@effy/design-system/ui";
import type { CapabilityFunction, CapabilityMethod, DriverCapability } from "@effy/shared-types";

import { useSessionRoles } from "@/features/auth/useSessionRoles";

import { canManageDrivers } from "../access";
import { FUNCTION_LABEL, METHOD_LABEL, zoneLabel } from "../capabilityModel";
import { driverCapabilitiesQuery, useGrantCapability, useRevokeCapability } from "../capabilityQueries";
import { driverActionError } from "../errorText";
import { zonesQuery } from "../queries";

const EVERY_ZONE = "__every__";

/**
 * What a driver is cleared to do, and where (062 US1/US2).
 *
 * ⚠ "EVERY ZONE" IS A CHOICE IN THE PICKER, NOT A SHORTCUT FOR SELECTING ALL OF THEM. Choosing it
 * sends `zoneId: null`, which the platform stores as a fact — so the driver covers a zone created
 * next month with nobody revisiting this screen. Selecting today's zones one by one would be right
 * on the day and quietly wrong afterwards, with nothing failing and nobody told.
 */
export function CapabilityEditor({ driverId }: { driverId: string }) {
  const roles = useSessionRoles();
  const canManage = canManageDrivers(roles);

  const capabilities = useQuery(driverCapabilitiesQuery(driverId));
  const zones = useQuery(zonesQuery());
  const grant = useGrantCapability(driverId);
  const revoke = useRevokeCapability(driverId);

  const [fn, setFn] = useState<CapabilityFunction>("delivery");
  const [method, setMethod] = useState<CapabilityMethod>("standard");
  const [zone, setZone] = useState<string>(EVERY_ZONE);
  const [error, setError] = useState<string | null>(null);

  const items = capabilities.data?.items ?? [];

  return (
    <div className="space-y-5">
      {items.length === 0 ? (
        // ⚠ FR-015 — a stated fact, not blank space. This is the single thing stopping this driver
        // being given any work at all, and an empty area reads as "nothing to say here".
        <p className="text-sm font-medium">
          Not cleared for any work. Until something is granted below, this driver cannot be given
          anything to do.
        </p>
      ) : (
        <ul className="divide-y border-y">
          {items.map((c: DriverCapability) => (
            <li key={c.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3 text-sm">
              <span className="font-medium">{FUNCTION_LABEL[c.function]}</span>
              <span>{METHOD_LABEL[c.method]}</span>
              {/* ⚠ Rendered from `zoneId === null`, never from a server-supplied label. */}
              <span className={c.zoneId === null ? "font-medium" : "text-muted-foreground"}>
                {zoneLabel(c.zoneName)}
              </span>
              {canManage ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={() => {
                    setError(null);
                    revoke.mutate(c.id, { onError: (e) => setError(driverActionError(e, "update")) });
                  }}
                >
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cap-fn">Work</Label>
            <select
              id="cap-fn"
              className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
              value={fn}
              onChange={(e) => setFn(e.target.value as CapabilityFunction)}
            >
              {(Object.keys(FUNCTION_LABEL) as CapabilityFunction[]).map((f) => (
                <option key={f} value={f}>
                  {FUNCTION_LABEL[f]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cap-method">Method</Label>
            <select
              id="cap-method"
              className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value as CapabilityMethod)}
            >
              {(Object.keys(METHOD_LABEL) as CapabilityMethod[]).map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cap-zone">Where</Label>
            <select
              id="cap-zone"
              className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            >
              {/* ⚠ First, and stated as a fact — it is the broadest and the most useful. */}
              <option value={EVERY_ZONE}>Every zone (including new ones)</option>
              {(zones.data ?? []).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>

          <Button
            type="button"
            disabled={grant.isPending}
            onClick={() => {
              setError(null);
              grant.mutate(
                { function: fn, method, zoneId: zone === EVERY_ZONE ? null : zone },
                { onError: (e) => setError(driverActionError(e, "update")) },
              );
            }}
          >
            {grant.isPending ? "Granting…" : "Grant clearance"}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
