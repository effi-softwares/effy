import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { Clock, Radio } from "lucide-react"

import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { Callout, Loading, Panel, PanelSkeleton, TableSkeleton } from "@effy/web-kit/patterns"
import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { dispatchDayQuery } from "@/features/dispatch/queries"

import { canManageDrivers } from "../access"
import { driverActionError } from "../errorText"
import { durationSince, formatTime } from "../model"
import { dutyQuery, useEndDutySession } from "../queries"
import { useState } from "react"

export function DutyPanel() {
  const roles = useSessionRoles()
  const canManage = canManageDrivers(roles)
  const [error, setError] = useState<string | null>(null)

  const { data, error: queryError, isPending, isError, refetch } = useQuery(dutyQuery())
  const endSession = useEndDutySession()
  const day = useQuery(dispatchDayQuery())

  if (isError) return <ErrorState error={queryError} onRetry={() => void refetch()} />
  if (isPending) {
    return (
      <Loading label="Loading who is on duty">
        <PanelSkeleton title="On duty now" icon={<Radio aria-hidden="true" />} description flush>
          <TableSkeleton columns={["Driver", "Doing now", "Zone", "On duty", "Finish", ""]} rows={3} />
        </PanelSkeleton>
      </Loading>
    )
  }

  const waiting = data.unassigned.readyToCollect + data.unassigned.readyToDeliver
  const roundOf = (driverId: string) => day.data?.rounds.find((r) => r.driverId === driverId)

  return (
    <Panel
      title="On duty now"
      icon={<Radio aria-hidden="true" />}
      description={
        waiting > 0 && data.unassigned.driversOnDuty === 0 ? undefined : waiting > 0 ? (
          <>
            {data.onDuty.length} {data.onDuty.length === 1 ? "driver" : "drivers"} ·{" "}
            <span className="tabular-nums">{waiting}</span> {waiting === 1 ? "package is" : "packages are"} waiting to
            be picked up on the next assignment round
            {data.unassigned.readyToDeliver > 0
              ? ` (${data.unassigned.readyToCollect} to collect, ${data.unassigned.readyToDeliver} to deliver)`
              : ""}
            .
          </>
        ) : (
          `${data.onDuty.length} ${data.onDuty.length === 1 ? "driver" : "drivers"}`
        )
      }
      actions={
        <span className="text-xs text-muted-foreground">
          Drivers go on duty from the driver app; back-office cannot do it for them.
        </span>
      }
      flush
    >
      {waiting > 0 && data.unassigned.driversOnDuty === 0 ? (
        <div className="px-5 pt-4">
          <Callout
            tone="destructive"
            title={
              <>
                Nobody is on duty, and <span className="tabular-nums">{waiting}</span>{" "}
                {waiting === 1 ? "package is" : "packages are"} waiting for a driver.
              </>
            }
          >
            Nothing will move until someone goes on duty in the driver app.
          </Callout>
        </div>
      ) : null}
      {error ? (
        <div className="px-5 pt-4">
          <Callout tone="destructive" title={error} />
        </div>
      ) : null}

      {data.onDuty.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">No drivers are on duty.</p>
      ) : (
        <div className="min-w-0">
          <Table className="ef-rtable">
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Doing now</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead>On duty</TableHead>
                <TableHead>Finish</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.onDuty.map((d) => {
                const round = roundOf(d.driverId)
                return (
                  <TableRow key={d.sessionId}>
                    <TableCell data-m="primary">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={`inline-block size-2 rounded-full ${round ? "bg-primary-fill" : "bg-success"}`}
                        />
                        <Link to="/drivers/$driverId" params={{ driverId: d.driverId }} className="link">
                          {d.driverName}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell data-m="meta">
                      {round
                        ? `${round.round.kind === "collection" ? "Collection run" : "Delivery round"}${round.stageLabel ? ` · ${round.stageLabel}` : ""}`
                        : "Idle - nothing is assigned"}
                    </TableCell>
                    <TableCell data-m="hide" className="text-muted-foreground">
                      {d.zone ?? "No zone"}
                    </TableCell>
                    <TableCell data-m="trail" className="whitespace-nowrap tabular-nums">
                      {durationSince(d.onDutySince)}
                    </TableCell>
                    <TableCell data-m="meta" data-label="Finish">
                      <span
                        className={
                          d.pastExpectedEnd ? "font-medium" : d.expectedEndAt ? undefined : "text-muted-foreground"
                        }
                      >
                        {d.pastExpectedEnd
                          ? "Past their expected finish"
                          : d.expectedEndAt
                            ? `Expects to finish ${formatTime(d.expectedEndAt)}`
                            : "Finish time unknown"}
                      </span>
                      {d.overdue ? (
                        <span className="late mt-1 flex">
                          <Clock aria-hidden="true" />
                          Shift running long
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell data-m="full" className="text-right w-auto!">
                      {d.overdue && canManage ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={endSession.isPending}
                          onClick={() => {
                            setError(null)
                            endSession.mutate(d.sessionId, {
                              onError: (e) => setError(driverActionError(e, "end-duty")),
                            })
                          }}
                        >
                          End shift
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  )
}
