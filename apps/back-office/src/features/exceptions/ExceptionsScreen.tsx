import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleCheck, Hourglass, PackageSearch, PackageX, Route, ShieldAlert, Undo2, Warehouse } from "lucide-react";

import { Button, Skeleton, Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@effy/web-kit/patterns";
import { EmptyState } from "@effy/web-kit/patterns";
import { StatusWord } from "@effy/web-kit/patterns";
import { useSessionRoles } from "@/features/auth/useSessionRoles";
import { moment } from "@/lib/format";

import { canResolveExceptions } from "./access";
import { reasonLabel, sortForTriage } from "./model";
import { exceptionsQuery } from "./queries";
import { RecordReturnButton } from "./RecordReturnDialog";
import { OUTCOME_WORDS, ResolveDialog } from "./ResolveDialog";
import { HeldPanel, OverduePanel, VehicleChecksPanel } from "./SequenceSections";

/**
 * Delivery exceptions: deliveries a driver could not complete, runs waiting on their next step, vehicles
 * found unsafe, and packages declared missing, as four lists, one at a time. Nothing resolves itself. A
 * csa reads every list and acts on none.
 */
type Section = "failed" | "runs" | "vehicles" | "missing";

export function ExceptionsScreen() {
  const [section, setSection] = useState<Section>("failed");
  const [showResolved, setShowResolved] = useState(false);
  const canResolve = canResolveExceptions(useSessionRoles());

  const open = useQuery(exceptionsQuery(false));
  // "Dealt with" is read only when someone asks for it — the open list is the working view.
  const all = useQuery({ ...exceptionsQuery(true), enabled: showResolved });

  const data = open.data;
  const unsafe = data?.vehicleChecks?.filter((c) => c.unsafe && c.clearedAt === null).length ?? 0;
  const resolved = all.data?.exceptions.filter((e) => e.resolvedAt !== null) ?? [];
  const failedRows = showResolved ? resolved : (data?.exceptions.filter((e) => e.resolvedAt === null) ?? []);

  return (
    <>
      <PageHeader
        title="Delivery exceptions"
        description="Deliveries a driver could not complete. Each one has a customer still waiting, so nothing here resolves itself."
        actions={
          <Button variant="outline" asChild>
            <Link to="/orders/assignments">
              <Route aria-hidden="true" />
              Dispatch
            </Link>
          </Button>
        }
      />

      {open.isError ? (
        <ErrorState error={open.error} onRetry={() => void open.refetch()} />
      ) : open.isPending || !data ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-9 w-[28rem] max-w-full" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
          <div className="bo-tabsbar">
            <div className="bo-tabsbar__list">
              <TabsList aria-label="Exception kinds">
                <TabsTrigger value="failed">
                  <PackageX aria-hidden="true" />
                  Failed deliveries
                  {Number(data.openCount) > 0 ? <TabsCount>{data.openCount}</TabsCount> : null}
                </TabsTrigger>
                <TabsTrigger value="runs">
                  <Hourglass aria-hidden="true" />
                  Runs waiting
                  {(data.overdue?.length ?? 0) > 0 ? <TabsCount>{data.overdue!.length}</TabsCount> : null}
                </TabsTrigger>
                <TabsTrigger value="vehicles">
                  <ShieldAlert aria-hidden="true" />
                  Vehicle checks
                  {unsafe > 0 ? <TabsCount>{unsafe}</TabsCount> : null}
                </TabsTrigger>
                <TabsTrigger value="missing">
                  <PackageSearch aria-hidden="true" />
                  Missing packages
                  {(data.held?.length ?? 0) > 0 ? <TabsCount>{data.held!.length}</TabsCount> : null}
                </TabsTrigger>
              </TabsList>
            </div>
            <span className="text-xs text-muted-foreground max-md:hidden">Live — nothing here refreshes on a timer</span>
          </div>

          <TabsContent value="failed" className="bo-tabpanel">
            <section className="space-y-3" aria-labelledby="failed-h">
              <div className="bo-tabs" role="tablist" aria-label="Show">
                <button type="button" role="tab" aria-selected={!showResolved} className={`bo-tabs__tab${!showResolved ? " is-active" : ""}`} onClick={() => setShowResolved(false)}>
                  Open<span className="bo-tabs__count">{data.openCount}</span>
                </button>
                <button type="button" role="tab" aria-selected={showResolved} className={`bo-tabs__tab${showResolved ? " is-active" : ""}`} onClick={() => setShowResolved(true)}>
                  Dealt with{all.data ? <span className="bo-tabs__count">{resolved.length}</span> : null}
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="failed-h" className="bo-section-title">
                  Failed deliveries
                </h2>
                <span className="text-xs text-muted-foreground">Open first, then newest · live</span>
              </div>
              {showResolved && all.isPending ? (
                <Skeleton className="h-40" />
              ) : showResolved && all.isError ? (
                <ErrorState error={all.error} onRetry={() => void all.refetch()} />
              ) : failedRows.length === 0 ? (
                /* A stated fact, not blank space. "Nothing failed" is information; an empty region is
                   indistinguishable from a screen that did not load. */
                <EmptyState
                  icon={CircleCheck}
                  title={showResolved ? "Nothing has been dealt with yet" : "Every delivery got through"}
                  description={showResolved ? undefined : "No driver has reported a delivery they could not complete."}
                />
              ) : (
                <div className="bo-table-wrap">
                  <div className="bo-table-scroll">
                    <table className="bo-table bo-rtable">
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Reason</th>
                          <th>Driver</th>
                          <th>Destination</th>
                          <th>Package</th>
                          <th>When</th>
                          <th className="is-actions">
                            <span className="sr-only">Action</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortForTriage(failedRows).map((e) => (
                          <tr key={e.exceptionId}>
                            <td data-m="primary">
                              <span className="bo-code font-medium">{e.orderNumber}</span>
                            </td>
                            <td data-m="meta">
                              <span className="font-medium">{reasonLabel(e.reason)}</span>
                              {/* The driver's own words, where they left any. */}
                              {e.note ? <span className="bo-sub">{e.note}</span> : null}
                            </td>
                            <td data-m="meta" data-label="Driver">
                              {e.driverName}
                            </td>
                            <td data-m="hide">{e.destinationSuburb ?? "—"}</td>
                            <td data-m="badge">
                              {/* "still in a van" and "back at the hub" are different problems. */}
                              {e.packageLocation === "with_driver" ? (
                                <StatusWord tone="problem" icon={Undo2}>
                                  With {e.driverName} — to return
                                </StatusWord>
                              ) : (
                                <StatusWord tone="moving" icon={Warehouse}>
                                  {e.returnedAt ? `Returned ${moment(e.returnedAt).toLowerCase()}` : "At hub"}
                                </StatusWord>
                              )}
                            </td>
                            <td data-m="hide" className="is-muted whitespace-nowrap">
                              {moment(e.failedAt)}
                            </td>
                            <td data-m="full" className="is-actions w-auto!">
                              {e.resolvedAt ? (
                                <span className="text-xs text-muted-foreground">
                                  {e.resolution?.outcome ? OUTCOME_WORDS[e.resolution.outcome].label : "Dealt with"}
                                  {e.resolution?.note ? <span className="bo-sub">{e.resolution.note}</span> : null}
                                </span>
                              ) : canResolve && e.packageLocation === "with_driver" ? (
                                /* Still in the van: it has to come back before anything else. */
                                <RecordReturnButton exception={e} />
                              ) : canResolve ? (
                                <ResolveDialog exception={e} />
                              ) : (
                                <span className="text-xs text-muted-foreground">Admin or manager</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </TabsContent>
          <TabsContent value="runs" className="bo-tabpanel">
            <OverduePanel data={data} />
          </TabsContent>
          <TabsContent value="vehicles" className="bo-tabpanel">
            <VehicleChecksPanel data={data} canAct={canResolve} />
          </TabsContent>
          <TabsContent value="missing" className="bo-tabpanel">
            <HeldPanel data={data} canAct={canResolve} />
          </TabsContent>
        </Tabs>
      )}

      {!canResolve ? (
        <p className="text-xs text-muted-foreground">A customer-service agent sees these lists read-only — closing and acting needs an admin or a manager.</p>
      ) : null}
    </>
  );
}
