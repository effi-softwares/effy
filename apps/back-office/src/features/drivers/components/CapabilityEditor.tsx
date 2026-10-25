import { useState } from "react"

import { useQuery } from "@tanstack/react-query"

import { Button, Label } from "@effy/design-system/ui"
import type { CapabilityFunction, DriverCapability } from "@effy/shared-types"

import { useSessionRoles } from "@/features/auth/useSessionRoles"

import { canManageDrivers } from "../access"
import { FUNCTION_HEADING, FUNCTION_LABEL, zoneLabel } from "../capabilityModel"
import { driverCapabilitiesQuery, useGrantCapability, useRevokeCapability } from "../capabilityQueries"
import { driverActionError } from "../errorText"
import { zonesQuery } from "../queries"

const EVERY_ZONE = "__every__"

export function CapabilityEditor({ driverId }: { driverId: string }) {
  const roles = useSessionRoles()
  const canManage = canManageDrivers(roles)

  const capabilities = useQuery(driverCapabilitiesQuery(driverId))
  const zones = useQuery(zonesQuery())
  const grant = useGrantCapability(driverId)
  const revoke = useRevokeCapability(driverId)

  const [fn, setFn] = useState<CapabilityFunction>("delivery")
  const [zone, setZone] = useState<string>(EVERY_ZONE)
  const [error, setError] = useState<string | null>(null)

  const items = capabilities.data?.items ?? []

  return (
    <div className="space-y-5">
      {items.length === 0 ? (
        <p className="text-sm font-medium">
          Not cleared for any work. Until something is granted below, this driver cannot be given anything to do.
        </p>
      ) : (
        <div className="space-y-4">
          {(Object.keys(FUNCTION_HEADING) as CapabilityFunction[]).map((f) => {
            const mine = items.filter((c: DriverCapability) => c.function === f)
            return (
              <section key={f} aria-label={FUNCTION_HEADING[f]}>
                <h3 className="text-sm font-medium">{FUNCTION_HEADING[f]}</h3>
                {mine.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">Nowhere.</p>
                ) : (
                  <ul className="divide-y border-y">
                    {mine.map((c: DriverCapability) => (
                      <li key={c.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3 text-sm">
                        <span className={c.zoneId === null ? "font-medium" : undefined}>{zoneLabel(c.zoneName)}</span>
                        {canManage ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={revoke.isPending}
                            onClick={() => {
                              setError(null)
                              revoke.mutate(c.id, { onError: (e) => setError(driverActionError(e, "update")) })
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
            )
          })}
        </div>
      )}

      {canManage ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
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

          <div className="space-y-2">
            <Label htmlFor="cap-zone">Where</Label>
            <select
              id="cap-zone"
              className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            >
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
              setError(null)
              grant.mutate(
                { function: fn, zoneId: zone === EVERY_ZONE ? null : zone },
                { onError: (e) => setError(driverActionError(e, "update")) },
              )
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
  )
}
