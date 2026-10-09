import { useQuery } from "@tanstack/react-query";

import { canDispatch } from "./access";
import { useSessionRoles } from "@/features/auth/useSessionRoles";
import { AssignmentActions } from "@/features/assign/AssignmentActions";
import { OrdersTabs } from "@/features/orders/OrdersTabs";

import { RoundTable } from "./components/RoundTable";
import { UnassignedPanel } from "./components/UnassignedPanel";
import { WindowsByDay } from "./components/WindowsByDay";
import { dispatchDayQuery } from "./queries";

/**
 * The dispatcher's day (063, US4 — FR-027/FR-028, SC-008).
 *
 * ⚠ THE PAGE IS ORDERED BY WHAT NEEDS DOING, NOT BY WHAT EXISTS. "Needs attention" is first; the
 * rounds proceeding normally are below it. D15's manage-by-exception is the whole design premise:
 * the engine earns its place by making the common case automatic and the exceptional case VISIBLE.
 *
 * ⚠ NO METRIC CARDS AT THE TOP (Principle V). The counts that matter are said in words inside the
 * section they describe, so a dispatcher reads one thing and acts, rather than scanning a row of
 * tiles that each need a second look to interpret.
 */
export function DispatchDayScreen() {
  const { data, isPending, isError, refetch } = useQuery(dispatchDayQuery());
  const mayAssign = canDispatch(useSessionRoles());

  if (isPending) {
    return <p className="p-6 text-sm text-muted-foreground">Loading today's work…</p>;
  }

  if (isError) {
    // ⚠ "We could not ask" must never look like "nothing is stuck" — an empty screen would tell a
    // dispatcher the opposite of the truth.
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">Today's work could not be loaded.</p>
        <button type="button" onClick={() => void refetch()} className="mt-2 text-sm underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Orders</h1>
        <p className="text-muted-foreground">
          Who has what, when each round opens, and anything that needs a driver. Auto-assign runs every
          5 minutes.
        </p>
      </header>
      <OrdersTabs />

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

      {/* 082 — every day on sale: each window's parcels and who has its round. */}
      <WindowsByDay />

      <section aria-labelledby="rounds-heading">
        <h2 id="rounds-heading" className="text-base font-medium">
          Rounds
        </h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <RoundTable rounds={data.rounds} />
        </div>
      </section>

    </div>
  );
}
