import { Link } from "@tanstack/react-router";
import { CircleAlert, Clock, Hourglass, PackageSearch, ShieldAlert } from "lucide-react";

import { isDomainError } from "@effy/api-client";
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
} from "@effy/design-system/ui";
import { HOLD_REASON_WORDS, VEHICLE_CHECK_WORDS, type DeliveryExceptionListDTO, type HeldPackageDTO, type VehicleCheckItem } from "@effy/shared-types";

import { Panel } from "@/components/patterns/Panel";
import { Callout } from "@/components/patterns/States";
import { StatusWord } from "@/components/patterns/StatusWord";
import { clockAt, moment } from "@/lib/format";

import { useClearVehicleCheck, useResolveHold } from "./queries";
import { ReasonDialog } from "./ReasonDialog";

/**
 * 093 — what else needs a dispatcher: runs whose next step is overdue, packages declared missing, and
 * vehicles found unsafe. Each is its own panel (redesign, board "Exceptions — open").
 */
export function sequenceActionError(err: unknown): string {
  if (!isDomainError(err)) return "Something went wrong. Nothing was changed — try again.";
  if (err.status === 403) return "Only an admin or a manager can do that.";
  if (err.status === 404) return "That is no longer there — somebody may have dealt with it. Reload to see.";
  return err.detail ?? "That could not be done. Nothing was changed.";
}

const NOBODY = <span className="text-xs text-muted-foreground">Admin or manager</span>;

export function OverduePanel({ data }: { data: DeliveryExceptionListDTO }) {
  const overdue = data.overdue ?? [];
  return (
    <Panel
      title="Runs waiting on their next step"
      icon={<Hourglass aria-hidden="true" />}
      description="Listed once a van isn't loaded, or collected parcels aren't checked in, in time."
      flush
    >
      {overdue.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">Every open run is loaded, and every finished collection is checked in.</p>
      ) : (
        <div className="bo-table-scroll">
          <table className="bo-table bo-rtable bo-table--plain">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Run</th>
                <th>Waiting on</th>
                <th className="is-num">For</th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((o) => (
                <tr key={o.roundId}>
                  <td data-m="primary">
                    <Link to="/orders/assignments/rounds/$roundId" params={{ roundId: o.roundId }} className="bo-link">
                      {o.driverName}
                    </Link>
                  </td>
                  <td data-m="meta">{o.kind === "delivery" ? "Delivery" : "Collection"}</td>
                  <td data-m="meta" data-label="Waiting on">
                    {o.kind === "delivery" ? "Loading the van" : "Hub check-in"}
                  </td>
                  <td data-m="trail" className="is-num">
                    <span className="bo-late">
                      <Clock aria-hidden="true" />
                      {o.minutes} min
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function HeldPanel({ data, canAct }: { data: DeliveryExceptionListDTO; canAct: boolean }) {
  const resolveHold = useResolveHold();
  const held = data.held ?? [];
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
        <div className="bo-table-scroll">
          <table className="bo-table bo-rtable bo-table--plain">
            <thead>
              <tr>
                <th>Order</th>
                <th>Shop</th>
                <th>Where</th>
                <th>Reason</th>
                <th>Driver</th>
                <th>When</th>
                <th className="is-actions">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {held.map((h) => (
                <tr key={h.holdId}>
                  <td data-m="primary">
                    <span className="bo-code font-medium">{h.orderNumber}</span>
                    {/* 096 — one bag held, or the whole package. */}
                    <span className="bo-sub">{h.parcel ? `Bag ${h.parcel.seq} of ${h.parcel.of} · ${h.parcel.code}` : "Whole package"}</span>
                  </td>
                  <td data-m="meta">{h.shopName}</td>
                  <td data-m="meta" data-label="Where">
                    {HOLD_STEP_WORDS[h.step] ?? h.step}
                  </td>
                  <td data-m="meta" data-label="Reason">
                    {HOLD_REASON_WORDS[h.reason] ?? h.reason}
                    {h.note ? <span className="bo-sub">{h.note}</span> : null}
                  </td>
                  <td data-m="hide">{h.driverName}</td>
                  <td data-m="hide" className="is-muted whitespace-nowrap">
                    {clockAt(h.createdAt)}
                  </td>
                  <td data-m="full" className="is-actions w-auto!">
                    {canAct ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={resolveHold.isPending}
                          onClick={() => void resolveHold.mutateAsync({ holdId: h.holdId, resolution: "found" }).catch(() => undefined)}
                        >
                          Found — plan again
                        </Button>
                        <LostButton hold={h} disabled={resolveHold.isPending} onConfirm={() => void resolveHold.mutateAsync({ holdId: h.holdId, resolution: "lost" }).catch(() => undefined)} />
                      </div>
                    ) : (
                      NOBODY
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** "Record a package as lost" — a decision, so a dialog that says what it does and doesn't do. */
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
  );
}

export function VehicleChecksPanel({ data, canAct }: { data: DeliveryExceptionListDTO; canAct: boolean }) {
  const clearCheck = useClearVehicleCheck();
  const checks = data.vehicleChecks ?? [];
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
        <div className="bo-table-scroll">
          <table className="bo-table bo-rtable bo-table--plain">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Vehicle</th>
                <th>Found</th>
                <th>When</th>
                <th className="is-actions">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.checkId}>
                  <td data-m="primary">{c.driverName}</td>
                  <td data-m="meta">{c.vehicleLabel}</td>
                  <td data-m="meta">
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
                  </td>
                  <td data-m="hide" className="is-muted whitespace-nowrap">
                    {moment(c.createdAt)}
                  </td>
                  <td data-m="full" className="is-actions w-auto!">
                    {!c.unsafe ? (
                      <span className="text-xs text-muted-foreground">No action needed</span>
                    ) : c.clearedAt ? (
                      <span className="text-xs text-muted-foreground">Cleared{c.clearNote ? ` — ${c.clearNote}` : ""}</span>
                    ) : canAct ? (
                      <ReasonDialog
                        label="Clear"
                        title={`Clear ${c.driverName}'s vehicle?`}
                        description="Only once it is fixed, or they are in another vehicle. They can be given work from the next planning pass."
                        fieldLabel="What was done"
                        confirmLabel="Clear"
                        onConfirm={async (note) => {
                          try {
                            await clearCheck.mutateAsync({ checkId: c.checkId, note });
                            return null;
                          } catch (err) {
                            return sequenceActionError(err);
                          }
                        }}
                      />
                    ) : (
                      NOBODY
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** 096 — where a driver declared it missing: any step can, now that every bag is accounted for. */
const HOLD_STEP_WORDS: Record<HeldPackageDTO["step"], string> = {
  collect: "Not at the shop at collection",
  checkin: "Not in the van at check-in",
  load: "Not loaded at the hub",
  deliver: "Not in the van at the door",
  return: "Not returned to the hub",
};
