import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { Button, Label } from "@effy/design-system/ui";
import type { CapabilityFunction, DriverCapability } from "@effy/shared-types";

import { useSessionRoles } from "@/features/auth/useSessionRoles";

import { canManageDrivers } from "../access";
import { FUNCTION_HEADING, FUNCTION_LABEL, zoneLabel } from "../capabilityModel";
import { driverCapabilitiesQuery, useGrantCapability, useRevokeCapability } from "../capabilityQueries";
import { driverActionError } from "../errorText";
import { zonesQuery } from "../queries";

const EVERY_ZONE = "__every__";

/**
 * What a driver is cleared to do, and where (062 US1/US2).
 *
 * ⚠ 082 — TWO THINGS, EACH WITH ITS AREAS: **Collects** and **Delivers**. The old second half of a
 * clearance ("standard" or "same-day") is gone from this screen and from the platform's decision:
 * who delivers a parcel is settled by the order, and a driver who may deliver in an area delivers
 * whatever Effy delivers there. A postcode filed under no area can go to any driver who delivers.
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
        <div className="space-y-4">
          {(Object.keys(FUNCTION_HEADING) as CapabilityFunction[]).map((f) => {
            const mine = items.filter((c: DriverCapability) => c.function === f);
            return (
              <section key={f} aria-label={FUNCTION_HEADING[f]}>
                <h3 className="text-sm font-medium">{FUNCTION_HEADING[f]}</h3>
                {mine.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">Nowhere.</p>
                ) : (
                  <ul className="divide-y border-y">
                    {mine.map((c: DriverCapability) => (
                      <li key={c.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3 text-sm">
                        {/* ⚠ Rendered from `zoneId === null`, never from a server-supplied label. */}
                        <span className={c.zoneId === null ? "font-medium" : undefined}>{zoneLabel(c.zoneName)}</span>
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
              </section>
            );
          })}
        </div>
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
            <Label htmlFor="cap-zone">Where</Label>
            <select
              id="cap-zone"
              className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            >
              {/* ⚠ First, and stated as a fact — it is the broadest and the most useful. */}
              <option value={EVERY_ZONE}>Everywhere (including new areas)</option>
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
                { function: fn, zoneId: zone === EVERY_ZONE ? null : zone },
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
