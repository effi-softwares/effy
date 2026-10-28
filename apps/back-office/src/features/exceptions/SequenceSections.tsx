import { Link } from "@tanstack/react-router"
import { CircleAlert, Clock, Hourglass, PackageSearch, ShieldAlert } from "lucide-react"

import { isDomainError } from "@effy/api-client"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui"
import {
  HOLD_REASON_WORDS,
  VEHICLE_CHECK_WORDS,
  type DeliveryExceptionListDTO,
  type HeldPackageDTO,
  type VehicleCheckItem,
} from "@effy/shared-types"

import { Panel, Callout, StatusWord } from "@effy/web-kit/patterns"
import { clockAt, moment } from "@/lib/format"

import { useClearVehicleCheck, useResolveHold } from "./queries"
import { ReasonDialog } from "./ReasonDialog"

export function sequenceActionError(err: unknown): string {
  if (!isDomainError(err)) return "Something went wrong. Nothing was changed — try again."
  if (err.status === 403) return "Only an admin or a manager can do that."
  if (err.status === 404) return "That is no longer there — somebody may have dealt with it. Reload to see."
  return err.detail ?? "That could not be done. Nothing was changed."
}

const NOBODY = <span className="text-xs text-muted-foreground">Admin or manager</span>

export function OverduePanel({ data }: { data: DeliveryExceptionListDTO }) {
  const overdue = data.overdue ?? []
  return (
    <Panel
      title="Runs waiting on their next step"
      icon={<Hourglass aria-hidden="true" />}
      description="Listed once a van isn't loaded, or collected parcels aren't checked in, in time."
      flush
    >
      {overdue.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          Every open run is loaded, and every finished collection is checked in.
        </p>
      ) : (
        <div className="min-w-0">
          <Table className="ef-rtable">
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Run</TableHead>
                <TableHead>Waiting on</TableHead>
                <TableHead numeric>For</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overdue.map((o) => (
                <TableRow key={o.roundId}>
                  <TableCell data-m="primary">
                    <Link to="/orders/assignments/rounds/$roundId" params={{ roundId: o.roundId }} className="link">
                      {o.driverName}
                    </Link>
                  </TableCell>
                  <TableCell data-m="meta">{o.kind === "delivery" ? "Delivery" : "Collection"}</TableCell>
                  <TableCell data-m="meta" data-label="Waiting on">
                    {o.kind === "delivery" ? "Loading the van" : "Hub check-in"}
                  </TableCell>
                  <TableCell numeric data-m="trail">
                    <span className="late">
                      <Clock aria-hidden="true" />
                      {o.minutes} min
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  )
}

export function HeldPanel({ data, canAct }: { data: DeliveryExceptionListDTO; canAct: boolean }) {
  const resolveHold = useResolveHold()
  const held = data.held ?? []
  return (
    <Panel
      title="Packages declared missing"
      icon={<PackageSearch aria-hidden="true" />}
      description="A driver left a package behind at loading or check-in. Plan it again once found, or record it as lost."
      flush
    >
      {resolveHold.isError ? (
        <div className="px-5 pt-4">
          <Callout tone="destructive" title={sequenceActionError(resolveHold.error)} />
        </div>
      ) : null}
      {held.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">No driver has left a package behind.</p>
      ) : (
        <div className="min-w-0">
          <Table className="ef-rtable">
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Shop</TableHead>
                <TableHead>Where</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Action</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {held.map((h) => (
                <TableRow key={h.holdId}>
                  <TableCell data-m="primary">
                    <span className="font-mono font-medium">{h.orderNumber}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {h.parcel ? `Bag ${h.parcel.seq} of ${h.parcel.of} · ${h.parcel.code}` : "Whole package"}
                    </span>
                  </TableCell>
                  <TableCell data-m="meta">{h.shopName}</TableCell>
                  <TableCell data-m="meta" data-label="Where">
                    {HOLD_STEP_WORDS[h.step] ?? h.step}
                  </TableCell>
                  <TableCell data-m="meta" data-label="Reason">
                    {HOLD_REASON_WORDS[h.reason] ?? h.reason}
                    {h.note ? <span className="mt-0.5 block text-sm text-muted-foreground">{h.note}</span> : null}
                  </TableCell>
                  <TableCell data-m="hide">{h.driverName}</TableCell>
                  <TableCell data-m="hide" className="text-muted-foreground whitespace-nowrap">
                    {clockAt(h.createdAt)}
                  </TableCell>
                  <TableCell data-m="full" className="text-right w-auto!">
                    {canAct ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={resolveHold.isPending}
                          onClick={() =>
                            void resolveHold
                              .mutateAsync({ holdId: h.holdId, resolution: "found" })
                              .catch(() => undefined)
                          }
                        >
                          Found — plan again
                        </Button>
                        <LostButton
                          hold={h}
                          disabled={resolveHold.isPending}
                          onConfirm={() =>
                            void resolveHold
                              .mutateAsync({ holdId: h.holdId, resolution: "lost" })
                              .catch(() => undefined)
                          }
                        />
                      </div>
                    ) : (
                      NOBODY
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  )
}

function LostButton({ hold, disabled, onConfirm }: { hold: HeldPackageDTO; disabled: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled}>
          Lost
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {hold.parcel
              ? `Record bag ${hold.parcel.seq} of ${hold.orderNumber}'s package from ${hold.shopName} as lost?`
              : `Record ${hold.orderNumber}'s package from ${hold.shopName} as lost?`}
          </AlertDialogTitle>
          <AlertDialogDescription>It will not be planned again.</AlertDialogDescription>
        </AlertDialogHeader>
        <Callout tone="muted" title="The customer is still owed these items">
          Recording it lost doesn't refund anything. Open the order afterwards to refund the items or credit points.
        </Callout>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Record as lost</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function VehicleChecksPanel({ data, canAct }: { data: DeliveryExceptionListDTO; canAct: boolean }) {
  const clearCheck = useClearVehicleCheck()
  const checks = data.vehicleChecks ?? []
  return (
    <Panel
      title="Vehicle checks today"
      icon={<ShieldAlert aria-hidden="true" />}
      description="Anything unsafe and the driver gets no work until it is cleared."
      flush
    >
      {checks.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">No vehicle check found a problem today.</p>
      ) : (
        <div className="min-w-0">
          <Table className="ef-rtable">
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Found</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Action</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checks.map((c) => (
                <TableRow key={c.checkId}>
                  <TableCell data-m="primary">{c.driverName}</TableCell>
                  <TableCell data-m="meta">{c.vehicleLabel}</TableCell>
                  <TableCell data-m="meta">
                    <ul className="space-y-1">
                      {c.answers
                        .filter((a) => a.answer !== "ok")
                        .map((a) => (
                          <li key={a.item} className="flex flex-wrap items-center gap-2">
                            {a.answer === "unsafe" ? (
                              <StatusWord tone="problem" icon={CircleAlert}>
                                Unsafe
                              </StatusWord>
                            ) : (
                              <StatusWord tone="muted">Minor</StatusWord>
                            )}
                            <span>
                              {VEHICLE_CHECK_WORDS[a.item as VehicleCheckItem] ?? a.item}
                              {a.note ? <span className="text-muted-foreground"> — {a.note}</span> : null}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </TableCell>
                  <TableCell data-m="hide" className="text-muted-foreground whitespace-nowrap">
                    {moment(c.createdAt)}
                  </TableCell>
                  <TableCell data-m="full" className="text-right w-auto!">
                    {!c.unsafe ? (
                      <span className="text-xs text-muted-foreground">No action needed</span>
                    ) : c.clearedAt ? (
                      <span className="text-xs text-muted-foreground">
                        Cleared{c.clearNote ? ` — ${c.clearNote}` : ""}
                      </span>
                    ) : canAct ? (
                      <ReasonDialog
                        label="Clear"
                        title={`Clear ${c.driverName}'s vehicle?`}
                        description="Only once it is fixed, or they are in another vehicle. They can be given work from the next planning pass."
                        fieldLabel="What was done"
                        confirmLabel="Clear"
                        onConfirm={async (note) => {
                          try {
                            await clearCheck.mutateAsync({ checkId: c.checkId, note })
                            return null
                          } catch (err) {
                            return sequenceActionError(err)
                          }
                        }}
                      />
                    ) : (
                      NOBODY
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  )
}

const HOLD_STEP_WORDS: Record<HeldPackageDTO["step"], string> = {
  collect: "Not at the shop at collection",
  checkin: "Not in the van at check-in",
  load: "Not loaded at the hub",
  deliver: "Not in the van at the door",
  return: "Not returned to the hub",
}
