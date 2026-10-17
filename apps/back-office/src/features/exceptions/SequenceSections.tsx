import { isDomainError } from "@effy/api-client";
import { Badge, Button } from "@effy/design-system/ui";
import { HOLD_REASON_WORDS, VEHICLE_CHECK_WORDS, type DeliveryExceptionListDTO, type VehicleCheckItem } from "@effy/shared-types";

import { useClearVehicleCheck, useResolveHold } from "./queries";
import { ReasonDialog } from "./ReasonDialog";

/** A refusal from a 093 action in a sentence; the server's own detail where it gave one. */
export function sequenceActionError(err: unknown): string {
  if (!isDomainError(err)) return "Something went wrong. Nothing was changed — try again.";
  if (err.status === 403) return "Only an admin or a manager can do that.";
  if (err.status === 404) return "That is no longer there — somebody may have dealt with it. Reload to see.";
  return err.detail ?? "That could not be done. Nothing was changed.";
}

const when = (iso: string) => new Date(iso).toLocaleString();

/**
 * 093 — what else needs a dispatcher about the order of drivers' work: runs whose next step is late,
 * packages a driver declared missing, and vehicles a driver found unsafe. Tables, each with a stated
 * empty line — a blank region reads as a screen that did not load.
 */
export function SequenceSections({ data, canAct }: { data: DeliveryExceptionListDTO; canAct: boolean }) {
  const resolveHold = useResolveHold();
  const clearCheck = useClearVehicleCheck();
  const overdue = data.overdue ?? [];
  const held = data.held ?? [];
  const checks = data.vehicleChecks ?? [];

  return (
    <>
      <section className="space-y-2">
        <h2 className="text-base font-medium">Runs waiting on their next step</h2>
        {overdue.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every open run is loaded, and every finished collection is checked in.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Driver</th>
                  <th className="px-3 py-2 font-medium">Run</th>
                  <th className="px-3 py-2 font-medium">Waiting on</th>
                  <th className="px-3 py-2 font-medium">For</th>
                </tr>
              </thead>
              <tbody>
                {overdue.map((o) => (
                  <tr key={o.roundId} className="border-t border-border">
                    <td className="px-3 py-2">{o.driverName}</td>
                    <td className="px-3 py-2">{o.kind === "delivery" ? "Delivery" : "Collection"}</td>
                    <td className="px-3 py-2">{o.kind === "delivery" ? "Loading the van" : "Hub check-in"}</td>
                    <td className="px-3 py-2 tabular-nums">{o.minutes} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-medium">Packages declared missing</h2>
        {held.length === 0 ? (
          <p className="text-sm text-muted-foreground">No driver has left a package behind.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Shop</th>
                  <th className="px-3 py-2 font-medium">Where</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Driver</th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium sr-only">Action</th>
                </tr>
              </thead>
              <tbody>
                {held.map((h) => (
                  <tr key={h.holdId} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-medium tabular-nums">{h.orderNumber}</td>
                    <td className="px-3 py-2">{h.shopName}</td>
                    <td className="px-3 py-2">{h.step === "load" ? "Not loaded at the hub" : "Not in the van at check-in"}</td>
                    <td className="px-3 py-2">
                      <div>{HOLD_REASON_WORDS[h.reason] ?? h.reason}</div>
                      {h.note ? <div className="mt-1 text-muted-foreground">{h.note}</div> : null}
                    </td>
                    <td className="px-3 py-2">{h.driverName}</td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{when(h.createdAt)}</td>
                    <td className="px-3 py-2 text-right">
                      {canAct ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline" size="sm" disabled={resolveHold.isPending}
                            onClick={() => void resolveHold.mutateAsync({ holdId: h.holdId, resolution: "found" }).catch(() => undefined)}
                          >
                            Found — plan again
                          </Button>
                          <Button
                            variant="outline" size="sm" disabled={resolveHold.isPending}
                            onClick={() => {
                              if (window.confirm(`Record ${h.orderNumber}'s package from ${h.shopName} as lost? It will not be planned again.`)) {
                                void resolveHold.mutateAsync({ holdId: h.holdId, resolution: "lost" }).catch(() => undefined);
                              }
                            }}
                          >
                            Lost
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Admin or manager</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {resolveHold.isError ? <p className="text-sm text-destructive">{sequenceActionError(resolveHold.error)}</p> : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-medium">Vehicle checks today</h2>
        {checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No vehicle check found a problem today.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Driver</th>
                  <th className="px-3 py-2 font-medium">Vehicle</th>
                  <th className="px-3 py-2 font-medium">Found</th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium sr-only">Action</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.checkId} className="border-t border-border align-top">
                    <td className="px-3 py-2">{c.driverName}</td>
                    <td className="px-3 py-2">{c.vehicleLabel}</td>
                    <td className="px-3 py-2">
                      <ul className="space-y-1">
                        {c.answers.filter((a) => a.answer !== "ok").map((a) => (
                          <li key={a.item}>
                            <Badge variant={a.answer === "unsafe" ? "destructive" : "secondary"}>
                              {a.answer === "unsafe" ? "Unsafe" : "Minor"}
                            </Badge>{" "}
                            {VEHICLE_CHECK_WORDS[a.item as VehicleCheckItem] ?? a.item}
                            {a.note ? <span className="text-muted-foreground"> — {a.note}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{when(c.createdAt)}</td>
                    <td className="px-3 py-2 text-right">
                      {!c.unsafe ? null : c.clearedAt ? (
                        <span className="text-muted-foreground">Cleared{c.clearNote ? ` — ${c.clearNote}` : ""}</span>
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
                        <span className="text-muted-foreground">Admin or manager</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
