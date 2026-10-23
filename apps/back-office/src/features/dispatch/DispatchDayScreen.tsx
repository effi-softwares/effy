import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarClock, PackageX, Truck, UserX } from "lucide-react";

import { Skeleton, Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@/components/patterns/Page";
import { AssignmentActions } from "@/features/assign/AssignmentActions";
import { useSessionRoles } from "@/features/auth/useSessionRoles";

import { canDispatch } from "./access";
import { RoundTable } from "./components/RoundTable";
import { UnassignedPanel } from "./components/UnassignedPanel";
import { WindowsByDay } from "./components/WindowsByDay";
import { dispatchDayQuery } from "./queries";

/**
 * Dispatch: who has what, when each round opens, and anything that needs a driver, in three sections
 * (Needs a driver · Delivery windows · Rounds). Auto-assign runs every 5 minutes; a person steps in only
 * where it can't. Re-read when work moves; nothing polls.
 */
type Section = "driver" | "windows" | "rounds";

export function DispatchDayScreen() {
  const { data, error, isPending, isError, refetch } = useQuery(dispatchDayQuery());
  const mayAssign = canDispatch(useSessionRoles());
  const [section, setSection] = useState<Section>("driver");

  return (
    <>
      <PageHeader
        title="Dispatch"
        description="Who has what, when each round opens, and anything that needs a driver. Auto-assign runs every 5 minutes — you step in only where it can't."
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-9 w-96 max-w-full" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {/* FR-009: parcels from failed deliveries, in a van or waiting at the hub for a decision. */}
          {data.failedParcels && (Number(data.failedParcels.withDrivers) > 0 || Number(data.failedParcels.returnedAwaitingDecision) > 0) ? (
            <Link to="/exceptions" className="bo-alert bo-alert--destructive no-underline">
              <PackageX aria-hidden="true" />
              <div className="bo-alert__title">
                Failed deliveries: {data.failedParcels.withDrivers} still with drivers · {data.failedParcels.returnedAwaitingDecision} back at the hub, waiting
                for a decision.
              </div>
              <div className="bo-alert__description">See exceptions — each one has a customer still waiting.</div>
            </Link>
          ) : null}

          <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
            <div className="bo-tabsbar">
              <div className="bo-tabsbar__list">
                <TabsList aria-label="Dispatch sections">
                  <TabsTrigger value="driver">
                    <UserX aria-hidden="true" />
                    Needs a driver
                    {data.unassigned.length > 0 ? <TabsCount>{data.unassigned.length}</TabsCount> : null}
                  </TabsTrigger>
                  <TabsTrigger value="windows">
                    <CalendarClock aria-hidden="true" />
                    Delivery windows
                  </TabsTrigger>
                  <TabsTrigger value="rounds">
                    <Truck aria-hidden="true" />
                    Rounds
                    <TabsCount>{data.rounds.length}</TabsCount>
                  </TabsTrigger>
                </TabsList>
              </div>
              <span className="text-xs text-muted-foreground max-md:hidden">Live — re-reads when a driver or auto-assign moves work</span>
            </div>

            <TabsContent value="driver" className="bo-tabpanel">
              <UnassignedPanel
                items={data.unassigned}
                renderAssign={
                  mayAssign
                    ? (item) => (
                        <AssignmentActions
                          packageId={item.packageId}
                          stage={item.stage}
                          assignment={{ assignmentId: null, driver: null, opensAt: null, dueAt: null, roundId: null, how: null, unassignedReason: null, movable: true }}
                          title={`${item.orderNumber} · ${item.shopName}`}
                        />
                      )
                    : undefined
                }
              />
            </TabsContent>
            {/* Every day on sale: each window's parcels and who has its round. */}
            <TabsContent value="windows" className="bo-tabpanel">
              <WindowsByDay />
            </TabsContent>
            <TabsContent value="rounds" className="bo-tabpanel">
              <RoundTable rounds={data.rounds} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </>
  );
}
