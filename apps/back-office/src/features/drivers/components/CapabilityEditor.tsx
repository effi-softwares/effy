import { useState } from "react"

import { useQuery } from "@tanstack/react-query"

import { Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@effy/design-system/ui"
import type { CapabilityFunction, DriverCapability } from "@effy/shared-types"
import { Bone, Loading } from "@effy/web-kit/patterns"

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
      {capabilities.isPending ? (
        // Not "not cleared": nothing is known until the clearances are read.
        <Loading label="Loading clearances">
          <div className="space-y-4">
            {(Object.keys(FUNCTION_HEADING) as CapabilityFunction[]).map((f) => (
              <section key={f} className="space-y-2">
                <h3 className="text-sm font-medium">{FUNCTION_HEADING[f]}</h3>
                <div className="divide-y border-y">
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <Bone className="w-40" />
                    <Bone kind="control" className="h-9 w-20" />
                  </div>
                </div>
              </section>
            ))}
          </div>
        </Loading>
      ) : items.length === 0 ? (
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
            <Select value={fn} onValueChange={(next) => setFn(next as CapabilityFunction)}>
              <SelectTrigger id="cap-fn" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FUNCTION_LABEL) as CapabilityFunction[]).map((f) => (
                  <SelectItem key={f} value={f}>
                    {FUNCTION_LABEL[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cap-zone">Where</Label>
            <Select value={zone} onValueChange={(next) => setZone(next)}>
              <SelectTrigger id="cap-zone" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EVERY_ZONE}>Everywhere (including new areas)</SelectItem>
                {(zones.data ?? []).map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
