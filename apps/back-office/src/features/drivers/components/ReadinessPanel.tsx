import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { CircleAlert, IdCard, MapPinned, UserX } from "lucide-react"

import { Avatar, AvatarFallback, Skeleton } from "@effy/design-system/ui"

import { Panel, EmptyState, StatusWord } from "@effy/web-kit/patterns"
import { initialsOf } from "@/components/shell/identity"

import { BLOCKED_LABEL, formatDate } from "../model"
import { readinessQuery } from "../queries"
import { CoveragePanel } from "./CoveragePanel"

export function ReadinessPanel() {
  const { data, isPending } = useQuery(readinessQuery())

  if (isPending) return <Skeleton className="h-64" />
  if (!data) return null

  const uncovered = data.uncoveredZones.filter((z) => z.activeDrivers === 0)
  const nothingWrong = data.blocked.length === 0 && uncovered.length === 0 && data.expiring.length === 0

  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      {nothingWrong ? (
        <div className="xl:col-span-2">
          <EmptyState
            icon={UserX}
            title="Everyone can work"
            description="Every driver can be given work, every zone has someone in it, and no licence or registration is close to expiring."
          />
        </div>
      ) : null}

      <Panel
        title="Drivers who cannot be given work"
        icon={<UserX aria-hidden="true" />}
        description="Fix the cause on their record — the next assignment pass picks them up."
        flush
      >
        {data.blocked.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">Every driver can be given work.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.blocked.map((b) => (
              <li key={b.driverId} className="flex items-center gap-3 px-5 py-3">
                <Avatar aria-hidden="true" className="rounded-lg">
                  <AvatarFallback className="rounded-lg">{initialsOf(b.driverName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <Link to="/drivers/$driverId" params={{ driverId: b.driverId }} className="link">
                    {b.driverName}
                  </Link>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {b.reasons.map((r) => BLOCKED_LABEL[r]).join(" · ")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Licences and registrations to renew"
        icon={<IdCard aria-hidden="true" />}
        description="Once a date passes, the driver cannot be given work."
        flush
      >
        {data.expiring.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">Nothing is close to expiring.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.expiring.map((e) => (
              <li key={`${e.driverId}:${e.kind}`} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <Link to="/drivers/$driverId" params={{ driverId: e.driverId }} className="link">
                    {e.driverName}
                  </Link>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {e.kind === "licence" ? "Driving licence" : "Vehicle registration"}
                  </span>
                </div>
                {e.expired ? (
                  <StatusWord tone="problem" icon={CircleAlert}>
                    expired {formatDate(e.expiresOn)}
                  </StatusWord>
                ) : (
                  <StatusWord tone="waiting">expires {formatDate(e.expiresOn)}</StatusWord>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="xl:col-span-2">
        <Panel
          title="Work nobody can cover"
          icon={<MapPinned aria-hidden="true" />}
          description="Grant a clearance on any driver's record."
        >
          <CoveragePanel />
        </Panel>
      </div>
    </div>
  )
}
